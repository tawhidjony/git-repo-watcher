import { basename, join } from "node:path";
import { runGit } from "./git.ts";
import { discoverUncloned } from "./remoteDiscovery.ts";
import { detectPlatform, normalizeRemote } from "./remotes.ts";
import type { AppConfig, RepoStatus, ScanResult } from "./types.ts";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "_fresh",
  "vendor",
  "dist",
  ".cache",
]);

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await Deno.stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function walk(
  dir: string,
  depth: number,
  found: Set<string>,
  warnings: string[],
): Promise<void> {
  if (depth >= 2) return;

  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const entry of Deno.readDir(dir)) entries.push(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Cannot read ${dir}: ${message}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory || entry.isSymlink) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const child = join(dir, entry.name);
    if (await isGitRepo(child)) {
      try {
        found.add(await Deno.realPath(child));
      } catch {
        found.add(child);
      }
      continue;
    }
    await walk(child, depth + 1, found, warnings);
  }
}

export async function findRepos(
  scanDirectories: string[],
  warnings: string[],
): Promise<string[]> {
  const found = new Set<string>();
  for (const dir of scanDirectories) {
    let root = dir;
    try {
      const stat = await Deno.stat(dir);
      if (!stat.isDirectory) {
        warnings.push(`${dir} is not a directory`);
        continue;
      }
      root = await Deno.realPath(dir);
    } catch {
      warnings.push(`Cannot read scan directory ${dir}`);
      continue;
    }

    if (await isGitRepo(root)) {
      found.add(root);
      continue;
    }
    await walk(root, 0, found, warnings);
  }
  return [...found];
}

function missingUpstream(stderr: string, code: number): boolean {
  return code !== 0 && /no upstream|upstream branch/i.test(stderr);
}

async function inspectRepo(
  repoPath: string,
  gitlabUrl: string,
): Promise<RepoStatus> {
  const repo: RepoStatus = {
    name: basename(repoPath),
    path: repoPath,
    platform: "other",
    remoteUrl: null,
    branch: "unknown",
    detached: false,
    noUpstream: false,
    ahead: null,
    behind: null,
    dirty: false,
    dirtyCount: 0,
    lastCommitRelative: null,
    lastCommitSubject: null,
    lastCommitAuthor: null,
    fetchError: null,
  };

  const fetched = await runGit(
    repoPath,
    ["fetch", "--all", "--prune", "--quiet"],
    30_000,
  );
  if (fetched.error || fetched.code !== 0) {
    const detail = (fetched.error || fetched.stderr || "git fetch failed")
      .replace(/\s+/g, " ")
      .trim();
    repo.fetchError = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
  }

  const [branch, status, log, remote] = await Promise.all([
    runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(repoPath, ["status", "--porcelain"]),
    runGit(repoPath, ["log", "-1", "--format=%cr|%s|%an"]),
    runGit(repoPath, ["config", "--get", "remote.origin.url"]),
  ]);

  if (branch.code === 0 && branch.stdout) {
    repo.branch = branch.stdout;
    repo.detached = branch.stdout === "HEAD";
  } else {
    repo.branch = "detached";
    repo.detached = true;
  }

  if (status.code === 0 && status.stdout) {
    const lines = status.stdout.split("\n").filter((line) => line.trim());
    repo.dirtyCount = lines.length;
    repo.dirty = lines.length > 0;
  }

  if (log.code === 0 && log.stdout) {
    const parts = log.stdout.split("|");
    if (parts.length >= 3) {
      repo.lastCommitRelative = parts[0] || null;
      repo.lastCommitAuthor = parts.at(-1) || null;
      repo.lastCommitSubject = parts.slice(1, -1).join("|") || null;
    }
  }

  if (remote.code === 0 && remote.stdout) {
    repo.remoteUrl = remote.stdout;
    repo.platform = detectPlatform(remote.stdout, gitlabUrl);
  }

  if (!repo.detached) {
    const [behind, ahead] = await Promise.all([
      runGit(repoPath, ["rev-list", "--count", "HEAD..@{u}"]),
      runGit(repoPath, ["rev-list", "--count", "@{u}..HEAD"]),
    ]);
    if (
      missingUpstream(behind.stderr, behind.code) ||
      missingUpstream(ahead.stderr, ahead.code)
    ) {
      repo.noUpstream = true;
    } else if (behind.code === 0 && ahead.code === 0) {
      const behindCount = Number.parseInt(behind.stdout, 10);
      const aheadCount = Number.parseInt(ahead.stdout, 10);
      repo.behind = Number.isNaN(behindCount) ? null : behindCount;
      repo.ahead = Number.isNaN(aheadCount) ? null : aheadCount;
    } else {
      repo.noUpstream = true;
    }
  }

  return repo;
}

export async function scanWorkspace(config: AppConfig): Promise<ScanResult> {
  const warnings: string[] = [];
  const scannedAt = new Date().toISOString();
  if (config.scanDirectories.length === 0) {
    warnings.push("No scan directories configured.");
  }
  const version = await runGit(Deno.cwd(), ["--version"], 5_000);
  if (version.error === "git is not installed or not on PATH") {
    warnings.push(version.error);
    const uncloned = await discoverUncloned(config, new Set(), warnings);
    return { repos: [], uncloned, warnings, scannedAt };
  }

  const paths = await findRepos(config.scanDirectories, warnings);
  const repos = await mapPool(
    paths,
    5,
    (path) => inspectRepo(path, config.gitlabUrl),
  );
  repos.sort((a, b) => {
    const aBehind = (a.behind ?? 0) > 0 ? 1 : 0;
    const bBehind = (b.behind ?? 0) > 0 ? 1 : 0;
    if (aBehind !== bBehind) return bBehind - aBehind;
    return a.name.localeCompare(b.name) || a.path.localeCompare(b.path);
  });

  const localKeys = new Set<string>();
  for (const repo of repos) {
    if (!repo.remoteUrl) continue;
    const key = normalizeRemote(repo.remoteUrl);
    if (key) localKeys.add(key);
  }

  const uncloned = await discoverUncloned(config, localKeys, warnings);
  return { repos, uncloned, warnings, scannedAt };
}

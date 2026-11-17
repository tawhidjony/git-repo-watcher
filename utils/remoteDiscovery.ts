import { normalizeRemote } from "./remotes.ts";
import type { AppConfig, RemoteRepo } from "./types.ts";

interface ListedRepo extends RemoteRepo {
  sshUrl?: string | null;
  htmlUrl?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scrub(message: string, token: string): string {
  return token ? message.split(token).join("[token]") : message;
}

async function fetchJson(
  url: URL,
  headers: Headers,
  token: string,
): Promise<unknown> {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 180);
    try {
      const parsed = JSON.parse(text);
      if (isRecord(parsed) && typeof parsed.message === "string") {
        detail = parsed.message;
      }
    } catch {
      // Keep the raw response snippet.
    }
    throw new Error(`${response.status} ${scrub(detail, token)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Remote API returned invalid JSON");
  }
}

function alreadyLocal(
  localKeys: Set<string>,
  urls: Array<string | null>,
): boolean {
  return urls.some((url) => {
    if (!url) return false;
    const key = normalizeRemote(url);
    return key !== null && localKeys.has(key);
  });
}

async function fetchGitHub(
  token: string,
  warnings: string[],
): Promise<ListedRepo[]> {
  const url = new URL("https://api.github.com/user/repos");
  url.searchParams.set("sort", "pushed");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mulitrepo-git-check",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  let payload: unknown;
  try {
    payload = await fetchJson(url, headers, token);
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : "GitHub request failed";
    warnings.push(`GitHub: ${scrub(message, token)}`);
    return [];
  }

  if (!Array.isArray(payload)) {
    warnings.push("GitHub: unexpected response");
    return [];
  }
  if (payload.length === 100) {
    warnings.push(
      "GitHub results are capped at the 100 most recently pushed repositories",
    );
  }

  const repos: ListedRepo[] = [];
  for (const item of payload) {
    if (!isRecord(item)) continue;
    const cloneUrl = readString(item, "clone_url");
    const fullName = readString(item, "full_name");
    if (!cloneUrl || !fullName) continue;
    repos.push({
      name: readString(item, "name") ?? fullName,
      fullName,
      platform: "github",
      cloneUrl,
      updatedAt: readString(item, "pushed_at") ?? "",
      description: readString(item, "description"),
      sshUrl: readString(item, "ssh_url"),
      htmlUrl: readString(item, "html_url"),
    });
  }
  return repos;
}

async function fetchGitLab(
  token: string,
  gitlabUrl: string,
  warnings: string[],
): Promise<ListedRepo[]> {
  let url: URL;
  try {
    url = new URL("/api/v4/projects", gitlabUrl);
  } catch {
    warnings.push("GitLab URL is invalid");
    return [];
  }
  url.searchParams.set("membership", "true");
  url.searchParams.set("order_by", "last_activity_at");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("per_page", "100");

  const headers = new Headers({
    "PRIVATE-TOKEN": token,
    "User-Agent": "mulitrepo-git-check",
  });

  let payload: unknown;
  try {
    payload = await fetchJson(url, headers, token);
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : "GitLab request failed";
    warnings.push(`GitLab: ${scrub(message, token)}`);
    return [];
  }

  if (!Array.isArray(payload)) {
    warnings.push("GitLab: unexpected response");
    return [];
  }
  if (payload.length === 100) {
    warnings.push(
      "GitLab results are capped at the 100 most recently active projects",
    );
  }

  const repos: ListedRepo[] = [];
  for (const item of payload) {
    if (!isRecord(item)) continue;
    const cloneUrl = readString(item, "http_url_to_repo");
    const fullName = readString(item, "path_with_namespace");
    if (!cloneUrl || !fullName) continue;
    repos.push({
      name: readString(item, "name") ?? fullName,
      fullName,
      platform: "gitlab",
      cloneUrl,
      updatedAt: readString(item, "last_activity_at") ?? "",
      description: readString(item, "description"),
      sshUrl: readString(item, "ssh_url_to_repo"),
    });
  }
  return repos;
}

export async function discoverUncloned(
  config: AppConfig,
  localKeys: Set<string>,
  warnings: string[],
): Promise<RemoteRepo[]> {
  const listed: ListedRepo[] = [];
  if (config.githubToken.trim()) {
    listed.push(...await fetchGitHub(config.githubToken.trim(), warnings));
  }
  if (config.gitlabToken.trim()) {
    listed.push(
      ...await fetchGitLab(
        config.gitlabToken.trim(),
        config.gitlabUrl,
        warnings,
      ),
    );
  }

  const seen = new Set<string>();
  const uncloned: RemoteRepo[] = [];
  for (const repo of listed) {
    const key = normalizeRemote(repo.cloneUrl);
    if (!key || seen.has(key)) continue;
    if (
      alreadyLocal(localKeys, [
        repo.cloneUrl,
        repo.sshUrl ?? null,
        repo.htmlUrl ?? null,
      ])
    ) {
      continue;
    }
    seen.add(key);
    uncloned.push({
      name: repo.name,
      fullName: repo.fullName,
      platform: repo.platform,
      cloneUrl: repo.cloneUrl,
      updatedAt: repo.updatedAt,
      description: repo.description,
    });
  }

  uncloned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return uncloned;
}

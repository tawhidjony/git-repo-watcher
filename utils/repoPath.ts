import { join, resolve } from "node:path";
import { ConfigError } from "./config.ts";

function isInside(root: string, target: string): boolean {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return target === root || target.startsWith(prefix);
}

export async function resolveAllowedRepo(
  repoPath: unknown,
  scanDirectories: string[],
): Promise<string> {
  if (typeof repoPath !== "string" || !repoPath.trim()) {
    throw new ConfigError("repoPath is required");
  }
  if (repoPath.includes("\0")) {
    throw new ConfigError("repoPath is invalid");
  }

  let resolved: string;
  try {
    resolved = await Deno.realPath(resolve(repoPath));
  } catch {
    throw new ConfigError("Repository path does not exist");
  }

  const roots: string[] = [];
  for (const dir of scanDirectories) {
    try {
      roots.push(await Deno.realPath(resolve(dir)));
    } catch {
      roots.push(resolve(dir));
    }
  }

  if (!roots.some((root) => isInside(root, resolved))) {
    throw new ConfigError(
      "Repository is outside the configured scan directories",
    );
  }

  try {
    await Deno.stat(join(resolved, ".git"));
  } catch {
    throw new ConfigError("Path is not a Git repository");
  }

  return resolved;
}

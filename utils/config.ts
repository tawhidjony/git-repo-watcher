import { join } from "node:path";
import type { AppConfig, ConfigUpdate, PublicConfig } from "./types.ts";

const CONFIG_PATH = join(Deno.cwd(), "config.json");
export const DEFAULT_GITLAB_URL = "https://gitlab.com";

export function defaultConfig(): AppConfig {
  return {
    scanDirectories: ["/home/tawhid/Documents/Simec"],
    githubToken: "",
    gitlabToken: "",
    gitlabUrl: DEFAULT_GITLAB_URL,
  };
}

export function toPublic(config: AppConfig): PublicConfig {
  return {
    scanDirectories: config.scanDirectories,
    gitlabUrl: config.gitlabUrl,
    githubTokenSet: config.githubToken.trim().length > 0,
    gitlabTokenSet: config.gitlabToken.trim().length > 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGitlabUrl(input: string): string {
  const trimmed = input.trim() || DEFAULT_GITLAB_URL;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConfigError("GitLab URL must be an http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError("GitLab URL must be an http(s) URL");
  }
  return url.origin;
}

function absoluteDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ConfigError("scanDirectories must be an array of absolute paths");
  }
  const dirs: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const dir = entry.trim();
    if (!dir.startsWith("/")) {
      throw new ConfigError(`Scan directory must be absolute: ${dir}`);
    }
    if (dir.includes("\0")) {
      throw new ConfigError("Scan directory contains an invalid character");
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

function optionalToken(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ConfigError(`${label} must be a string`);
  }
  const token = value.trim();
  if (!token) return undefined;
  if (token.length > 500 || /[\r\n]/.test(token)) {
    throw new ConfigError(`${label} is not a valid token`);
  }
  return token;
}

export function sanitizeConfig(value: unknown): AppConfig {
  const fallback = defaultConfig();
  if (!isRecord(value)) return fallback;
  return {
    scanDirectories: absoluteDirectories(
      value.scanDirectories ?? fallback.scanDirectories,
    ),
    githubToken: typeof value.githubToken === "string"
      ? value.githubToken.trim()
      : "",
    gitlabToken: typeof value.gitlabToken === "string"
      ? value.gitlabToken.trim()
      : "",
    gitlabUrl: normalizeGitlabUrl(
      typeof value.gitlabUrl === "string"
        ? value.gitlabUrl
        : fallback.gitlabUrl,
    ),
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const text = await Deno.readTextFile(CONFIG_PATH);
    return sanitizeConfig(JSON.parse(text));
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      const created = defaultConfig();
      await saveConfig(created);
      return created;
    }
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(
      "config.json could not be read. Fix the file or delete it to recreate the default.",
    );
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const body = JSON.stringify(
    {
      scanDirectories: config.scanDirectories,
      githubToken: config.githubToken,
      gitlabToken: config.gitlabToken,
      gitlabUrl: config.gitlabUrl,
    },
    null,
    2,
  );
  await Deno.writeTextFile(CONFIG_PATH, body + "\n");
}

export function applyUpdate(
  current: AppConfig,
  update: ConfigUpdate,
): AppConfig {
  const next: AppConfig = {
    scanDirectories: absoluteDirectories(update.scanDirectories),
    githubToken: current.githubToken,
    gitlabToken: current.gitlabToken,
    gitlabUrl: normalizeGitlabUrl(update.gitlabUrl),
  };

  const githubToken = optionalToken(update.githubToken, "GitHub token");
  if (githubToken) next.githubToken = githubToken;
  else if (update.clearGithubToken) next.githubToken = "";

  const gitlabToken = optionalToken(update.gitlabToken, "GitLab token");
  if (gitlabToken) next.gitlabToken = gitlabToken;
  else if (update.clearGitlabToken) next.gitlabToken = "";

  return next;
}

export function parseConfigUpdate(value: unknown): ConfigUpdate {
  if (!isRecord(value)) throw new ConfigError("Expected a JSON object");
  return {
    scanDirectories: absoluteDirectories(value.scanDirectories),
    gitlabUrl: typeof value.gitlabUrl === "string" ? value.gitlabUrl : "",
    githubToken: typeof value.githubToken === "string"
      ? value.githubToken
      : undefined,
    gitlabToken: typeof value.gitlabToken === "string"
      ? value.gitlabToken
      : undefined,
    clearGithubToken: value.clearGithubToken === true,
    clearGitlabToken: value.clearGitlabToken === true,
  };
}

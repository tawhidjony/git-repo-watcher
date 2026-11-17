import type { Platform } from "./types.ts";

/** Collapse SSH, SCP, and HTTPS remote URLs to `host/group/repo`. */
export function normalizeRemote(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  let host = "";
  let path = "";
  const scp = trimmed.match(/^[^@\s]+@([^:\s]+):(.+)$/);
  if (scp && !trimmed.includes("://")) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const url = new URL(trimmed);
      host = url.hostname;
      path = url.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  host = host.toLowerCase().replace(/^www\./, "");
  path = path.replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
  if (!host || !path) return null;
  return `${host}/${path}`;
}

export function gitlabHost(gitlabUrl: string): string | null {
  try {
    return new URL(gitlabUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function detectPlatform(remoteUrl: string, gitlabUrl: string): Platform {
  const key = normalizeRemote(remoteUrl);
  if (!key) return "other";
  const host = key.slice(0, key.indexOf("/"));
  if (host === "github.com") return "github";
  if (host === "gitlab.com") return "gitlab";
  const configured = gitlabHost(gitlabUrl);
  if (configured && configured === host) return "gitlab";
  return "other";
}

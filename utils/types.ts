export type Platform = "github" | "gitlab" | "other";

export interface AppConfig {
  scanDirectories: string[];
  githubToken: string;
  gitlabToken: string;
  gitlabUrl: string;
}

export interface PublicConfig {
  scanDirectories: string[];
  gitlabUrl: string;
  githubTokenSet: boolean;
  gitlabTokenSet: boolean;
}

export interface ConfigUpdate {
  scanDirectories: string[];
  gitlabUrl: string;
  githubToken?: string;
  gitlabToken?: string;
  clearGithubToken?: boolean;
  clearGitlabToken?: boolean;
}

export interface RepoStatus {
  name: string;
  path: string;
  platform: Platform;
  remoteUrl: string | null;
  branch: string;
  detached: boolean;
  noUpstream: boolean;
  ahead: number | null;
  behind: number | null;
  dirty: boolean;
  dirtyCount: number;
  lastCommitRelative: string | null;
  lastCommitSubject: string | null;
  lastCommitAuthor: string | null;
  fetchError: string | null;
}

export interface RemoteRepo {
  name: string;
  fullName: string;
  platform: "github" | "gitlab";
  cloneUrl: string;
  updatedAt: string;
  description: string | null;
}

export interface ScanResult {
  repos: RepoStatus[];
  uncloned: RemoteRepo[];
  warnings: string[];
  scannedAt: string;
}

import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type {
  Platform,
  PublicConfig,
  RemoteRepo,
  RepoStatus,
  ScanResult,
} from "../utils/types.ts";

type Filter = "all" | "behind" | "ahead" | "dirty";
type Tone = "emerald" | "amber" | "rose" | "zinc" | "orange" | "sky";

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error";
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "behind", label: "Needs Pull" },
  { id: "ahead", label: "Unpushed" },
  { id: "dirty", label: "Dirty" },
];

function Spinner() {
  return (
    <span
      class="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}

function Badge(props: { children: ComponentChildren; tone: Tone }) {
  const tones: Record<Tone, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    rose: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
    zinc: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
    orange: "bg-orange-500/15 text-orange-200 ring-orange-500/30",
    sky: "bg-sky-500/15 text-sky-200 ring-sky-500/30",
  };
  return (
    <span
      class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        tones[props.tone]
      }`}
    >
      {props.children}
    </span>
  );
}

function platformTone(platform: Platform): Tone {
  if (platform === "github") return "zinc";
  if (platform === "gitlab") return "orange";
  return "sky";
}

function platformLabel(platform: Platform): string {
  if (platform === "github") return "GitHub";
  if (platform === "gitlab") return "GitLab";
  return "Other";
}

function formatWhen(value: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") return body.error;
    if (body && typeof body.stderr === "string" && body.stderr) {
      return body.stderr;
    }
  } catch {
    // Ignore invalid JSON.
  }
  return fallback;
}

export default function Dashboard() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pulling, setPulling] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unclonedOpen, setUnclonedOpen] = useState(true);
  const requestId = useRef(0);
  const toastId = useRef(0);

  function toast(message: string, tone: Toast["tone"]) {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4500);
  }

  async function load() {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch("/api/repos");
      if (!response.ok) {
        throw new Error(
          await readError(response, `Scan failed (${response.status})`),
        );
      }
      const body = await response.json() as ScanResult;
      if (id !== requestId.current) return;
      setData(body);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      const message = err instanceof Error ? err.message : "Scan failed";
      setError(message);
      if (data) toast(message, "error");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function pull(repo: RepoStatus) {
    setPulling(repo.path);
    try {
      const response = await fetch("/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoPath: repo.path }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        const detail = typeof body.stderr === "string" && body.stderr
          ? body.stderr
          : typeof body.error === "string"
          ? body.error
          : "Pull failed";
        toast(`${repo.name}: ${detail}`, "error");
      } else {
        const detail = typeof body.stdout === "string" && body.stdout
          ? body.stdout
          : "Already up to date";
        toast(`${repo.name}: ${detail}`, "ok");
      }
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Pull failed", "error");
    } finally {
      setPulling(null);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Clone URL copied", "ok");
    } catch {
      toast("Could not copy the clone URL", "error");
    }
  }

  const repos = data?.repos ?? [];
  const visible = repos.filter((repo) => {
    const needle = query.trim().toLowerCase();
    if (needle && !repo.name.toLowerCase().includes(needle)) return false;
    if (filter === "behind") return (repo.behind ?? 0) > 0;
    if (filter === "ahead") return (repo.ahead ?? 0) > 0;
    if (filter === "dirty") return repo.dirty;
    return true;
  });

  const counts = {
    total: repos.length,
    behind: repos.filter((repo) => (repo.behind ?? 0) > 0).length,
    ahead: repos.filter((repo) => (repo.ahead ?? 0) > 0).length,
    dirty: repos.filter((repo) => repo.dirty).length,
  };

  return (
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p class="text-xs font-medium tracking-wide text-emerald-400 uppercase">
              Local git
            </p>
            <h1 class="text-xl font-semibold text-zinc-50">
              Repository dashboard
            </h1>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={load}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? <Spinner /> : null}
              Refresh All
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary
            label="Total Local Repos"
            value={counts.total}
            hint="On disk"
          />
          <Summary
            label="Remote Updates Available"
            value={counts.behind}
            hint="Behind upstream"
          />
          <Summary
            label="Unpushed Changes"
            value={counts.ahead}
            hint="Ahead of upstream"
          />
          <Summary
            label="Uncommitted Changes"
            value={counts.dirty}
            hint="Dirty working tree"
          />
        </section>

        {error && !data
          ? (
            <p class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          )
          : null}

        {data?.warnings.length
          ? (
            <ul class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )
          : null}

        <section class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            class="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by status"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                class={`rounded-full px-3 py-1.5 text-sm ${
                  filter === item.id
                    ? "bg-zinc-100 text-zinc-950"
                    : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800"
                }`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label class="block w-full sm:w-72">
            <span class="sr-only">Search by repository name</span>
            <input
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search by repo name"
              class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </label>
        </section>

        {loading && !data
          ? (
            <p class="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-400">
              Scanning repositories and fetching remotes…
            </p>
          )
          : null}

        {!loading && data && visible.length === 0
          ? (
            <p class="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-400">
              {repos.length === 0
                ? "No Git repositories found. Add a folder in Settings."
                : "No repositories match this filter."}
            </p>
          )
          : null}

        <section class="flex flex-col gap-3">
          {visible.map((repo) => (
            <article
              key={repo.path}
              class="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-lg font-semibold text-zinc-50">
                      {repo.name}
                    </h2>
                    <Badge tone={platformTone(repo.platform)}>
                      {platformLabel(repo.platform)}
                    </Badge>
                    <Badge tone="sky">{repo.branch}</Badge>
                  </div>
                  <p class="mt-1 truncate font-mono text-xs text-zinc-500">
                    {repo.path}
                  </p>
                </div>
                {(repo.behind ?? 0) > 0
                  ? (
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                        disabled={pulling !== null}
                        onClick={() => pull(repo)}
                      >
                        {pulling === repo.path ? <Spinner /> : null}
                        Pull Latest
                      </button>
                    </div>
                  )
                  : null}
              </div>

              <p class="mt-3 text-sm text-zinc-200">
                {repo.lastCommitSubject ?? "No commits yet"}
              </p>
              <p class="mt-1 text-xs text-zinc-500">
                {[repo.lastCommitRelative, repo.lastCommitAuthor].filter(
                  Boolean,
                ).join(" · ") ||
                  "No commit metadata"}
              </p>

              <div class="mt-3 flex flex-wrap gap-2">
                {(repo.behind ?? 0) > 0
                  ? <Badge tone="emerald">{repo.behind} behind</Badge>
                  : null}
                {(repo.ahead ?? 0) > 0
                  ? <Badge tone="amber">{repo.ahead} ahead</Badge>
                  : null}
                {repo.dirty
                  ? <Badge tone="rose">{repo.dirtyCount} uncommitted</Badge>
                  : null}
                {repo.detached
                  ? <Badge tone="zinc">Detached HEAD</Badge>
                  : null}
                {repo.noUpstream
                  ? <Badge tone="zinc">No upstream</Badge>
                  : null}
                {repo.fetchError
                  ? (
                    <span title={repo.fetchError}>
                      <Badge tone="amber">Fetch failed</Badge>
                    </span>
                  )
                  : null}
              </div>
            </article>
          ))}
        </section>

        <section class="rounded-xl border border-zinc-800 bg-zinc-900">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            aria-expanded={unclonedOpen}
            onClick={() => setUnclonedOpen((open) => !open)}
          >
            <span class="font-medium text-zinc-100">
              Not cloned locally
              <span class="ml-2 text-sm font-normal text-zinc-500">
                {data?.uncloned.length ?? 0}
              </span>
            </span>
            <span class="text-sm text-zinc-500">
              {unclonedOpen ? "Hide" : "Show"}
            </span>
          </button>
          {unclonedOpen
            ? (
              <div class="border-t border-zinc-800">
                {(data?.uncloned.length ?? 0) === 0
                  ? (
                    <p class="px-4 py-4 text-sm text-zinc-500">
                      No uncloned GitHub or GitLab repositories. Add a token in
                      Settings to look up your account.
                    </p>
                  )
                  : data?.uncloned.map((repo) => (
                    <RemoteRow
                      key={`${repo.platform}:${repo.fullName}`}
                      repo={repo}
                      onCopy={copyUrl}
                    />
                  ))}
              </div>
            )
            : null}
        </section>

        {data
          ? (
            <p class="text-xs text-zinc-500">
              Last scan {formatWhen(data.scannedAt)}
            </p>
          )
          : null}
      </main>

      <div
        class="fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <p
            key={item.id}
            class={`rounded-lg px-3 py-2 text-sm shadow-lg ${
              item.tone === "ok"
                ? "bg-emerald-700 text-white"
                : "bg-rose-700 text-white"
            }`}
          >
            {item.message}
          </p>
        ))}
      </div>

      {settingsOpen
        ? (
          <SettingsModal
            onClose={() => setSettingsOpen(false)}
            onSaved={() => {
              setSettingsOpen(false);
              toast("Settings saved", "ok");
              load();
            }}
          />
        )
        : null}
    </div>
  );
}

function Summary(props: { label: string; value: number; hint: string }) {
  return (
    <article class="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p class="text-xs tracking-wide text-zinc-500 uppercase">{props.label}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
        {props.value}
      </p>
      <p class="text-xs text-zinc-500">{props.hint}</p>
    </article>
  );
}

function RemoteRow(props: { repo: RemoteRepo; onCopy: (url: string) => void }) {
  const { repo } = props;
  return (
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 last:border-b-0">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="font-medium text-zinc-100">{repo.fullName}</h3>
          <Badge tone={platformTone(repo.platform)}>
            {platformLabel(repo.platform)}
          </Badge>
        </div>
        <p class="mt-1 text-xs text-zinc-500">
          Updated {formatWhen(repo.updatedAt)}
        </p>
        <p class="mt-1 truncate font-mono text-xs text-zinc-400">
          {repo.cloneUrl}
        </p>
      </div>
      <button
        type="button"
        class="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
        onClick={() => props.onCopy(repo.cloneUrl)}
      >
        Copy URL
      </button>
    </div>
  );
}

function SettingsModal(props: { onClose: () => void; onSaved: () => void }) {
  const [directories, setDirectories] = useState<string[]>([""]);
  const [gitlabUrl, setGitlabUrl] = useState("https://gitlab.com");
  const [githubToken, setGithubToken] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [githubTokenSet, setGithubTokenSet] = useState(false);
  const [gitlabTokenSet, setGitlabTokenSet] = useState(false);
  const [clearGithub, setClearGithub] = useState(false);
  const [clearGitlab, setClearGitlab] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response, "Could not load settings"));
        }
        return await response.json() as PublicConfig;
      })
      .then((config) => {
        if (cancelled) return;
        setDirectories(
          config.scanDirectories.length ? config.scanDirectories : [""],
        );
        setGitlabUrl(config.gitlabUrl);
        setGithubTokenSet(config.githubTokenSet);
        setGitlabTokenSet(config.gitlabTokenSet);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load settings",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  async function save(event: Event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scanDirectories: directories.map((dir) => dir.trim()).filter(Boolean),
          gitlabUrl,
          githubToken,
          gitlabToken,
          clearGithubToken: clearGithub,
          clearGitlabToken: clearGitlab,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not save settings"));
      }
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      class="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={props.onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        class="mt-10 w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={save}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-title" class="text-lg font-semibold">Settings</h2>
            <p class="mt-1 text-sm text-zinc-400">
              Folders are scanned two levels deep for Git repositories. Tokens
              stay in local config.json.
            </p>
          </div>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        {loading
          ? <p class="mt-6 text-sm text-zinc-400">Loading settings…</p>
          : (
            <div class="mt-5 flex flex-col gap-4">
              <fieldset class="flex flex-col gap-2">
                <legend class="text-sm font-medium text-zinc-200">
                  Scan folders
                </legend>
                {directories.map((dir, index) => (
                  <div key={index} class="flex gap-2">
                    <input
                      value={dir}
                      spellcheck={false}
                      placeholder="/absolute/path/to/projects"
                      aria-label={`Scan folder ${index + 1}`}
                      class="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
                      onInput={(event) => {
                        const next = directories.slice();
                        next[index] = event.currentTarget.value;
                        setDirectories(next);
                      }}
                    />
                    <button
                      type="button"
                      class="rounded-lg border border-zinc-700 px-2 text-sm text-zinc-300 hover:bg-zinc-800"
                      onClick={() => {
                        const next = directories.filter((_, i) =>
                          i !== index
                        );
                        setDirectories(next.length ? next : [""]);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  class="self-start text-sm text-emerald-400 hover:text-emerald-300"
                  onClick={() => setDirectories([...directories, ""])}
                >
                  Add folder
                </button>
              </fieldset>

              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium text-zinc-200">GitLab URL</span>
                <input
                  value={gitlabUrl}
                  spellcheck={false}
                  class="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
                  onInput={(event) => setGitlabUrl(event.currentTarget.value)}
                />
                <span class="text-xs text-zinc-500">
                  Use http://192.168.30.51 for the private GitLab host.
                </span>
              </label>

              <div class="flex flex-col gap-1 text-sm">
                <label class="flex flex-col gap-1">
                  <span class="font-medium text-zinc-200">GitHub token</span>
                  <input
                    type="password"
                    autocomplete="off"
                    value={githubToken}
                    placeholder={githubTokenSet
                      ? "Saved — enter a new token to replace it"
                      : "github_pat_…"}
                    class="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    onInput={(event) => {
                      setGithubToken(event.currentTarget.value);
                      if (event.currentTarget.value) setClearGithub(false);
                    }}
                  />
                </label>
                {githubTokenSet
                  ? (
                    <label class="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={clearGithub}
                        onChange={(event) =>
                          setClearGithub(event.currentTarget.checked)}
                      />
                      Remove saved GitHub token
                    </label>
                  )
                  : null}
              </div>

              <div class="flex flex-col gap-1 text-sm">
                <label class="flex flex-col gap-1">
                  <span class="font-medium text-zinc-200">GitLab token</span>
                  <input
                    type="password"
                    autocomplete="off"
                    value={gitlabToken}
                    placeholder={gitlabTokenSet
                      ? "Saved — enter a new token to replace it"
                      : "glpat-…"}
                    class="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    onInput={(event) => {
                      setGitlabToken(event.currentTarget.value);
                      if (event.currentTarget.value) setClearGitlab(false);
                    }}
                  />
                </label>
                {gitlabTokenSet
                  ? (
                    <label class="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={clearGitlab}
                        onChange={(event) =>
                          setClearGitlab(event.currentTarget.checked)}
                      />
                      Remove saved GitLab token
                    </label>
                  )
                  : null}
              </div>

              {error ? <p class="text-sm text-rose-300">{error}</p> : null}

              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={props.onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? <Spinner /> : null}
                  Save
                </button>
              </div>
            </div>
          )}
      </form>
    </div>
  );
}

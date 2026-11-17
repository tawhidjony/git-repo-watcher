# Local Git dashboard

A Fresh 2 app that scans local folders for Git repositories, shows which ones
are behind, ahead, or dirty, and lists GitHub or GitLab repositories that are
not cloned on this machine.

`clone-repos.sh` is unchanged. It still clones the BNPIMS backend repositories.

## Run

Install [Deno](https://docs.deno.com/runtime/getting_started/installation/),
then from this directory:

```sh
deno task dev
```

Open http://127.0.0.1:5173. The dev server is bound to localhost. Vite needs
broad permissions, so `deno task dev` uses the Fresh template task.

Production, after a build:

```sh
deno task build
deno task start
```

`start` listens on http://127.0.0.1:8000 and is limited to:

- `--allow-net` for the HTTP server plus the GitHub and GitLab APIs. The host
  list is not pinned because the GitLab URL is configurable. The process still
  binds only to `127.0.0.1`.
- `--allow-read` so scan folders can live anywhere on disk.
- `--allow-env` so `git` and `cursor` inherit `PATH`.
- `--allow-run=git,cursor` so the server can only launch those programs.
- `--allow-write=config.json` so Settings can update the local config. Git
  writes inside `.git` through the `git` subprocess, not through Deno.

## Configuration

Copy the example if `config.json` is missing. The app creates one on first
launch.

```sh
cp config.example.json config.json
```

`config.json` is gitignored because it can hold tokens.

| Field             | Purpose                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `scanDirectories` | Absolute folders to scan, two levels deep, for `.git` directories.                                                     |
| `githubToken`     | Optional GitHub personal access token. Used to list repos you have not cloned.                                         |
| `gitlabToken`     | Optional GitLab personal access token.                                                                                 |
| `gitlabUrl`       | GitLab origin. Default `https://gitlab.com`. Set `http://192.168.30.51` for the private host used by `clone-repos.sh`. |

Edit these from **Settings** in the dashboard. Saved tokens are not sent back to
the browser; leave the password field blank to keep the current token.

## What a refresh does

For each repository, up to five at a time:

1. `git fetch --all --prune --quiet` (a failure is reported, and local status is
   still shown)
2. Current branch, ahead/behind counts, dirty files, last commit, and `origin`
   URL

Detached `HEAD`, a missing upstream, and an offline fetch do not fail the whole
scan.

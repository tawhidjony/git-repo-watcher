import { assertEquals } from "jsr:@std/assert@^1.0.14";
import { detectPlatform, normalizeRemote } from "./remotes.ts";

Deno.test("normalize ssh and https GitHub urls", () => {
  assertEquals(
    normalizeRemote("git@github.com:Owner/Repo.git"),
    "github.com/owner/repo",
  );
  assertEquals(
    normalizeRemote("https://github.com/Owner/Repo.git"),
    "github.com/owner/repo",
  );
  assertEquals(
    normalizeRemote("ssh://git@github.com/Owner/Repo.git"),
    "github.com/owner/repo",
  );
  assertEquals(
    normalizeRemote("https://www.github.com/Owner/Repo"),
    "github.com/owner/repo",
  );
});

Deno.test("normalize GitLab scp urls with subgroups", () => {
  assertEquals(
    normalizeRemote("git@192.168.30.51:bnpims/backend/api-module.git"),
    "192.168.30.51/bnpims/backend/api-module",
  );
  assertEquals(
    normalizeRemote("https://gitlab.com/group/sub/repo.git"),
    "gitlab.com/group/sub/repo",
  );
});

Deno.test("detect platform uses the configured GitLab host", () => {
  assertEquals(
    detectPlatform("git@github.com:a/b.git", "https://gitlab.com"),
    "github",
  );
  assertEquals(
    detectPlatform("https://gitlab.com/a/b.git", "https://gitlab.com"),
    "gitlab",
  );
  assertEquals(
    detectPlatform(
      "git@192.168.30.51:bnpims/backend/api.git",
      "http://192.168.30.51",
    ),
    "gitlab",
  );
  assertEquals(
    detectPlatform(
      "git@192.168.30.51:bnpims/backend/api.git",
      "https://gitlab.com",
    ),
    "other",
  );
});

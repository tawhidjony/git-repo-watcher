import { ConfigError, loadConfig } from "../../utils/config.ts";
import { runGit } from "../../utils/git.ts";
import { resolveAllowedRepo } from "../../utils/repoPath.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    try {
      const body = await ctx.req.json();
      const repoPath = body && typeof body === "object"
        ? (body as { repoPath?: unknown }).repoPath
        : undefined;
      const config = await loadConfig();
      const allowed = await resolveAllowedRepo(
        repoPath,
        config.scanDirectories,
      );
      const result = await runGit(allowed, ["pull", "--ff-only"], 60_000);
      const ok = result.code === 0 && !result.error;
      return Response.json({
        ok,
        code: result.code,
        stdout: result.stdout,
        stderr: result.error || result.stderr,
      }, { status: ok ? 200 : 422 });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return Response.json({ ok: false, error: "Expected a JSON body" }, {
          status: 400,
        });
      }
      const message = err instanceof Error ? err.message : "Pull failed";
      const status = err instanceof ConfigError ? 400 : 500;
      return Response.json({ ok: false, error: message }, { status });
    }
  },
});

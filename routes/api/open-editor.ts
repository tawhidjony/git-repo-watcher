import { ConfigError, loadConfig } from "../../utils/config.ts";
import { openInCursor } from "../../utils/editor.ts";
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
      await openInCursor(allowed);
      return Response.json({ ok: true });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return Response.json({ ok: false, error: "Expected a JSON body" }, {
          status: 400,
        });
      }
      const message = err instanceof Error
        ? err.message
        : "Could not open editor";
      const status = err instanceof ConfigError ? 400 : 500;
      return Response.json({ ok: false, error: message }, { status });
    }
  },
});

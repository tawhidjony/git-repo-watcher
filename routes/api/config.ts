import {
  applyUpdate,
  ConfigError,
  loadConfig,
  parseConfigUpdate,
  saveConfig,
  toPublic,
} from "../../utils/config.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET() {
    try {
      return Response.json(toPublic(await loadConfig()));
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : "Could not read config";
      const status = err instanceof ConfigError ? 400 : 500;
      return Response.json({ error: message }, { status });
    }
  },
  async POST(ctx) {
    try {
      const update = parseConfigUpdate(await ctx.req.json());
      const next = applyUpdate(await loadConfig(), update);
      await saveConfig(next);
      return Response.json({ ok: true, config: toPublic(next) });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return Response.json({ ok: false, error: "Expected a JSON body" }, {
          status: 400,
        });
      }
      const message = err instanceof Error
        ? err.message
        : "Could not save config";
      const status = err instanceof ConfigError ? 400 : 500;
      return Response.json({ ok: false, error: message }, { status });
    }
  },
});

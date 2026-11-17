import { ConfigError, loadConfig } from "../../utils/config.ts";
import { scanWorkspace } from "../../utils/gitScanner.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET() {
    try {
      const config = await loadConfig();
      return Response.json(await scanWorkspace(config));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      const status = err instanceof ConfigError ? 400 : 500;
      return Response.json({ error: message }, { status });
    }
  },
});

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { attach } from "../cdp/client.js";
import { detectPort } from "../cdp/port.js";
import { ok, fail } from "../lib/result.js";

export const definition: Tool = {
  name: "browser_setup",
  description:
    "Attach to a Chrome page target serving localhost:<port> via CDP (endpoint configurable via BROWSER_VERIFIER_CDP_URL, default http://127.0.0.1:9223). Auto-detects port from .env.local / lsof if omitted. Primes console + network buffers. Call once at the start of a verification cycle; subsequent browser_* tools reuse the same CDP session (no per-call spawn overhead).",
  inputSchema: {
    type: "object",
    properties: {
      port: {
        type: "number",
        description:
          "Dev server port (e.g. 3000). Omit to auto-detect from .env.local or lsof.",
      },
    },
  },
};

export async function handler(args: { port?: number }) {
  const t0 = Date.now();
  const port = args.port ?? detectPort();
  try {
    const info = await attach(port);
    return ok({ ok: true, ...info, elapsedMs: Date.now() - t0 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), {
      port,
      elapsedMs: Date.now() - t0,
    });
  }
}

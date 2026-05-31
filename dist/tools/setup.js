import { attach } from "../cdp/client.js";
import { detectPort } from "../cdp/port.js";
import { ok, fail } from "../lib/result.js";
export const definition = {
    name: "browser_setup",
    description: "Attach to a Chrome page target via CDP. Two ports involved:\n" +
        "  - port (dev server, e.g. 3000): Auto-detect from .env.local or lsof if omitted.\n" +
        "  - cdpPort (Chrome remote-debugging port, default 9223): Override if Chrome was launched with a different --remote-debugging-port. Falls back to BROWSER_VERIFIER_CDP_URL env if set, otherwise http://127.0.0.1:9223.\n" +
        "Primes console + network buffers. Call once per verification cycle; subsequent browser_* tools reuse the same session.",
    inputSchema: {
        type: "object",
        properties: {
            port: {
                type: "number",
                description: "Dev server port (e.g. 3000). Omit to auto-detect from .env.local or lsof.",
            },
            cdpPort: {
                type: "number",
                description: "Chrome remote-debugging port (default 9223). Use when Chrome was launched with a non-default --remote-debugging-port. For Docker/WSL setups with a non-localhost host, set BROWSER_VERIFIER_CDP_URL env instead.",
            },
        },
    },
};
export async function handler(args) {
    const t0 = Date.now();
    const port = args.port ?? detectPort();
    const cdpUrl = args.cdpPort !== undefined
        ? `http://127.0.0.1:${args.cdpPort}`
        : undefined;
    try {
        const info = await attach(port, cdpUrl);
        return ok({ ok: true, ...info, elapsedMs: Date.now() - t0 });
    }
    catch (e) {
        return fail(e instanceof Error ? e.message : String(e), {
            port,
            cdpUrl: cdpUrl ?? "(default)",
            elapsedMs: Date.now() - t0,
        });
    }
}
//# sourceMappingURL=setup.js.map
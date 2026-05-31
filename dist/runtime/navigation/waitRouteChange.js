import { globMatch } from "../../lib/glob.js";
const DEFAULT_TIMEOUT_MS = 5000;
export async function waitRouteChange(page, pattern, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    try {
        await page.waitForURL((url) => globMatch(pattern, url.toString()), {
            timeout: timeoutMs,
        });
        return {
            ok: true,
            url: page.url(),
            elapsedMs: Date.now() - started,
        };
    }
    catch (e) {
        return {
            ok: false,
            url: page.url(),
            elapsedMs: Date.now() - started,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
//# sourceMappingURL=waitRouteChange.js.map
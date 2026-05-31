import { ensureAttached } from "../runtime/client.js";
const DEFAULT_TIMEOUT_MS = 8000;
export async function evalInBrowser(script, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const state = await ensureAttached();
    const t0 = Date.now();
    try {
        const value = await withTimeout(state.page.evaluate((s) => {
            // eslint-disable-next-line no-eval
            return eval(s);
        }, script), timeoutMs);
        return {
            ok: true,
            value,
            elapsedMs: Date.now() - t0,
        };
    }
    catch (e) {
        return {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            elapsedMs: Date.now() - t0,
        };
    }
}
function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`eval timeout after ${ms}ms`)), ms);
        p.then((v) => {
            clearTimeout(timer);
            resolve(v);
        }, (e) => {
            clearTimeout(timer);
            reject(e);
        });
    });
}
//# sourceMappingURL=eval.js.map
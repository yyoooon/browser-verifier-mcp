import { ensureAttached } from "../runtime/client.js";
import { globMatch } from "../lib/glob.js";
const DEFAULT_TIMEOUT_MS = 5000;
export async function waitForUrl(pattern, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!pattern) {
        return {
            ok: false,
            elapsedMs: 0,
            error: "wait_url needs a glob in the 'pattern' field (alias: 'url'), e.g. { op: 'wait_url', pattern: '**/dashboard' }",
        };
    }
    const state = await ensureAttached();
    const t0 = Date.now();
    try {
        await state.page.waitForURL((url) => globMatch(pattern, url.toString()), {
            timeout: timeoutMs,
        });
        return {
            ok: true,
            elapsedMs: Date.now() - t0,
            finalValue: state.page.url(),
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - t0,
            finalValue: state.page.url(),
            error: `URL did not match ${pattern}: ${errorMessage(e)}`,
        };
    }
}
export async function waitForText(text, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const state = await ensureAttached();
    const t0 = Date.now();
    try {
        await state.page.waitForFunction((t) => document.body && document.body.innerText.includes(t), text, { timeout: timeoutMs, polling: 100 });
        return {
            ok: true,
            elapsedMs: Date.now() - t0,
            finalValue: true,
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - t0,
            finalValue: false,
            error: `text "${text}" did not appear: ${errorMessage(e)}`,
        };
    }
}
export async function waitForSelector(selector, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const state = await ensureAttached();
    const t0 = Date.now();
    try {
        await state.page
            .locator(selector)
            .first()
            .waitFor({ state: "attached", timeout: timeoutMs });
        return {
            ok: true,
            elapsedMs: Date.now() - t0,
            finalValue: true,
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - t0,
            finalValue: false,
            error: `selector "${selector}" not found: ${errorMessage(e)}`,
        };
    }
}
// "hidden" also resolves when the element is detached or never existed —
// exactly the semantics wanted for "modal/toast is gone".
export async function waitForGone(selector, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const state = await ensureAttached();
    const t0 = Date.now();
    try {
        await state.page
            .locator(selector)
            .first()
            .waitFor({ state: "hidden", timeout: timeoutMs });
        return {
            ok: true,
            elapsedMs: Date.now() - t0,
            finalValue: true,
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - t0,
            finalValue: false,
            error: `selector "${selector}" still present/visible: ${errorMessage(e)}`,
        };
    }
}
export async function waitForLoad(state = "load", timeoutMs = DEFAULT_TIMEOUT_MS) {
    const runtime = await ensureAttached();
    const t0 = Date.now();
    try {
        if (state === "hydrated") {
            await runtime.page.waitForFunction(() => {
                const root = document.body;
                if (!root)
                    return false;
                const stack = [root];
                while (stack.length) {
                    const el = stack.pop();
                    for (const k of Object.keys(el)) {
                        if (k.startsWith("__reactFiber") || k.startsWith("__reactProps"))
                            return true;
                    }
                    if (el.children) {
                        for (let i = 0; i < el.children.length && i < 50; i++)
                            stack.push(el.children[i]);
                    }
                }
                return false;
            }, undefined, { timeout: timeoutMs, polling: 100 });
        }
        else {
            await runtime.page.waitForLoadState(state, { timeout: timeoutMs });
        }
        return {
            ok: true,
            elapsedMs: Date.now() - t0,
            finalValue: state,
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - t0,
            error: `wait_load(${state}) failed: ${errorMessage(e)}`,
        };
    }
}
function errorMessage(e) {
    if (e instanceof Error)
        return e.message;
    return String(e);
}
//# sourceMappingURL=wait.js.map
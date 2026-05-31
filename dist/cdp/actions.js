import { ensureAttached } from "../runtime/client.js";
import { waitForUrl } from "./wait.js";
import { safeFill } from "../runtime/interaction/safeFill.js";
import { safeClick } from "../runtime/interaction/safeClick.js";
import { waitPageStable } from "../runtime/navigation/waitPageStable.js";
const CLICK_TAG_ATTR = "data-vb-click-target";
const CLICK_TAG_SELECTOR = `[${CLICK_TAG_ATTR}]`;
function findAndTag(target) {
    const visible = (el) => {
        const he = el;
        if (!he || !he.getClientRects)
            return false;
        if (he.getClientRects().length === 0)
            return false;
        const cs = getComputedStyle(he);
        return cs.visibility !== "hidden" && cs.display !== "none";
    };
    const all = Array.from(document.querySelectorAll("button, a, [role=button], [role=link], [role=tab], [role=menuitem], input[type=submit], input[type=button], label, [data-slot]")).filter(visible);
    let hit = all.find((el) => el.textContent && el.textContent.trim() === target) ??
        null;
    if (!hit) {
        hit =
            all.find((el) => el.textContent && el.textContent.trim().includes(target)) ?? null;
    }
    if (!hit) {
        hit = all.find((el) => el.getAttribute("aria-label") === target) ?? null;
    }
    if (!hit)
        return null;
    document
        .querySelectorAll("[data-vb-click-target]")
        .forEach((el) => el.removeAttribute("data-vb-click-target"));
    hit.setAttribute("data-vb-click-target", "");
    let hydrated = false;
    for (const k of Object.keys(hit)) {
        if (k.startsWith("__reactFiber") || k.startsWith("__reactProps")) {
            hydrated = true;
            break;
        }
    }
    return {
        hydrated,
        clickedText: (hit.textContent || hit.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 80),
    };
}
export async function clickByText(text, hydrationTimeoutMs = 3000) {
    const t0 = Date.now();
    let state;
    try {
        state = await ensureAttached();
    }
    catch (e) {
        return { ok: false, error: errMsg(e), elapsedMs: Date.now() - t0 };
    }
    let foundInfo = null;
    let waitedMs = 0;
    try {
        const handle = await state.page.waitForFunction(findAndTag, text, {
            timeout: hydrationTimeoutMs + 500,
            polling: 50,
        });
        const v = (await handle.jsonValue());
        await handle.dispose();
        waitedMs = Date.now() - t0;
        if (!v) {
            return {
                ok: false,
                matched: 0,
                waitedMs,
                error: `no clickable element with text "${text}"`,
                elapsedMs: Date.now() - t0,
            };
        }
        foundInfo = v;
    }
    catch (e) {
        return {
            ok: false,
            matched: 0,
            waitedMs,
            error: `no clickable element with text "${text}": ${errMsg(e)}`,
            elapsedMs: Date.now() - t0,
        };
    }
    const locator = state.page.locator(CLICK_TAG_SELECTOR).first();
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
        const r = await safeClick(locator, {
            timeoutMs: 3000,
            stabilize: true,
            stabilizeTimeoutMs: 3000,
        });
        if (r.ok) {
            return {
                ok: true,
                matched: 1,
                clickedText: foundInfo.clickedText,
                hydrated: foundInfo.hydrated,
                waitedMs,
                elapsedMs: Date.now() - t0,
            };
        }
        lastError = r.error;
        if (attempt < 1) {
            try {
                await state.page.evaluate(findAndTag, text);
            }
            catch {
                break;
            }
        }
    }
    return {
        ok: false,
        matched: 1,
        clickedText: foundInfo.clickedText,
        hydrated: foundInfo.hydrated,
        waitedMs,
        error: `click failed: ${lastError ?? "unknown"}`,
        elapsedMs: Date.now() - t0,
    };
}
export async function clickAndWaitForUrl(clickText, expectedUrl, timeoutMs = 5000) {
    const t0 = Date.now();
    const click = await clickByText(clickText);
    if (!click.ok) {
        return { ok: false, error: click.error, elapsedMs: Date.now() - t0 };
    }
    const wait = await waitForUrl(expectedUrl.startsWith("**") ? expectedUrl : `**${expectedUrl}`, timeoutMs);
    if (!wait.ok) {
        return {
            ok: false,
            finalUrl: wait.finalValue,
            error: wait.error,
            elapsedMs: Date.now() - t0,
        };
    }
    try {
        const state = await ensureAttached();
        await waitPageStable(state.page, {
            timeoutMs: 3000,
            networkIdle: true,
            animations: false,
        });
    }
    catch {
        // stabilize is best-effort
    }
    return {
        ok: true,
        finalUrl: wait.finalValue,
        elapsedMs: Date.now() - t0,
    };
}
export async function fillReactInput(selector, value) {
    const t0 = Date.now();
    try {
        const state = await ensureAttached();
        const locator = state.page.locator(selector).first();
        const result = await safeFill(locator, value);
        return {
            ok: result.ok,
            finalValue: result.finalValue,
            error: result.ok ? undefined : (result.error ?? "fill failed"),
            elapsedMs: Date.now() - t0,
        };
    }
    catch (e) {
        return {
            ok: false,
            error: errMsg(e),
            elapsedMs: Date.now() - t0,
        };
    }
}
export async function navigate(url, timeoutMs = 10000) {
    const t0 = Date.now();
    try {
        const state = await ensureAttached();
        await state.page.goto(url, { timeout: timeoutMs, waitUntil: "load" });
        await waitPageStable(state.page, {
            timeoutMs: 3000,
            networkIdle: true,
            animations: false,
        });
        return {
            ok: true,
            finalUrl: state.page.url(),
            elapsedMs: Date.now() - t0,
        };
    }
    catch (e) {
        return {
            ok: false,
            error: errMsg(e),
            elapsedMs: Date.now() - t0,
        };
    }
}
export async function reload() {
    const t0 = Date.now();
    try {
        const state = await ensureAttached();
        await state.page.reload({ waitUntil: "load" });
        await waitPageStable(state.page, {
            timeoutMs: 3000,
            networkIdle: true,
            animations: false,
        });
        return {
            ok: true,
            finalUrl: state.page.url(),
            elapsedMs: Date.now() - t0,
        };
    }
    catch (e) {
        return {
            ok: false,
            error: errMsg(e),
            elapsedMs: Date.now() - t0,
        };
    }
}
export async function activateTab() {
    const state = await ensureAttached();
    await state.page.bringToFront();
}
function errMsg(e) {
    return e instanceof Error ? e.message : String(e);
}
//# sourceMappingURL=actions.js.map
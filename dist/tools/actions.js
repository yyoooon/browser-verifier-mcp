import { ensureAttached } from "../runtime/client.js";
import { fillReactInput, navigate, clickByText } from "../cdp/actions.js";
import { safeClick } from "../runtime/interaction/safeClick.js";
import { ok, fail } from "../lib/result.js";
function errMsg(e) {
    return e instanceof Error ? e.message : String(e);
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// ===== browser_fill ============================================
export const fillDefinition = {
    name: "browser_fill",
    description: "Fill a text input or textarea, safe for React controlled components. " +
        "Tries Playwright locator.fill() first; on value-mismatch falls back to the native HTMLInputElement value setter + bubbling input/change events so React internal state syncs. " +
        "Use this instead of browser_eval for typing into search boxes / form fields. " +
        "Returns { ok, finalValue, elapsedMs }.",
    inputSchema: {
        type: "object",
        properties: {
            selector: {
                type: "string",
                description: "CSS selector for the input/textarea (first match used).",
            },
            value: {
                type: "string",
                description: "Value to set in the field (empty string to clear).",
            },
        },
        required: ["selector", "value"],
    },
};
export async function fillHandler(args) {
    if (!args.selector)
        return fail("selector is required.");
    if (args.value === undefined || args.value === null)
        return fail("value is required (use empty string to clear).");
    const r = await fillReactInput(args.selector, args.value);
    if (!r.ok)
        return fail(r.error ?? "fill failed", { elapsedMs: r.elapsedMs });
    return ok({
        ok: true,
        finalValue: r.finalValue,
        elapsedMs: r.elapsedMs,
    });
}
// ===== browser_click ===========================================
export const clickDefinition = {
    name: "browser_click",
    description: "Click an element by selector or visible text. " +
        "Uses native HTMLElement.click() so React onClick handlers fire reliably even inside Radix / Headless UI portals where coordinate-based clicks miss. " +
        "Provide either selector OR text (not both). " +
        "Returns { ok, elapsedMs } (+ clickedText when text path).",
    inputSchema: {
        type: "object",
        properties: {
            selector: {
                type: "string",
                description: "CSS selector (first match used).",
            },
            text: {
                type: "string",
                description: "Visible text to match (exact preferred, partial fallback). Searches button/a/[role=button|link|tab|menuitem]/input[type=submit|button]/label/[data-slot].",
            },
        },
    },
};
export async function clickHandler(args) {
    if (!args.selector && !args.text)
        return fail("Either selector or text is required.");
    if (args.selector && args.text)
        return fail("Provide either selector or text, not both.");
    if (args.text) {
        const r = await clickByText(args.text);
        if (!r.ok)
            return fail(r.error ?? "click failed", { elapsedMs: r.elapsedMs });
        return ok({
            ok: true,
            clickedText: r.clickedText,
            elapsedMs: r.elapsedMs,
        });
    }
    const t0 = Date.now();
    try {
        const state = await ensureAttached();
        const locator = state.page.locator(args.selector).first();
        const r = await safeClick(locator, { stabilize: true });
        if (!r.ok)
            return fail(r.error ?? "click failed", { elapsedMs: r.elapsedMs });
        return ok({ ok: true, elapsedMs: r.elapsedMs });
    }
    catch (e) {
        return fail(errMsg(e), { elapsedMs: Date.now() - t0 });
    }
}
// ===== browser_press_key =======================================
export const pressKeyDefinition = {
    name: "browser_press_key",
    description: "Press a keyboard key. " +
        "If selector is given, focuses the element first and dispatches the keypress there (good for submitting forms via Enter on a specific input). " +
        "If selector is omitted, the key is sent to the currently active element via page.keyboard.press(). " +
        "Key names follow Playwright/W3C: 'Enter', 'Escape', 'Tab', 'ArrowDown', 'Backspace', etc. " +
        "Returns { ok, key, elapsedMs }.",
    inputSchema: {
        type: "object",
        properties: {
            selector: {
                type: "string",
                description: "Optional CSS selector to press the key on.",
            },
            key: {
                type: "string",
                description: "Key name (W3C): 'Enter', 'Escape', 'Tab', 'ArrowDown', 'Backspace', etc.",
            },
        },
        required: ["key"],
    },
};
export async function pressKeyHandler(args) {
    const t0 = Date.now();
    if (!args.key)
        return fail("key is required.");
    try {
        const state = await ensureAttached();
        if (args.selector) {
            const loc = state.page.locator(args.selector).first();
            await loc.press(args.key, { timeout: 5000 });
        }
        else {
            await state.page.keyboard.press(args.key);
        }
        return ok({ ok: true, key: args.key, elapsedMs: Date.now() - t0 });
    }
    catch (e) {
        return fail(errMsg(e), { elapsedMs: Date.now() - t0 });
    }
}
// ===== browser_select_option ===================================
export const selectOptionDefinition = {
    name: "browser_select_option",
    description: "Open a custom dropdown (Radix Select / Headless UI Listbox / shadcn Select / any [role=combobox] trigger that opens a [role=listbox] with [role=option] children) and pick an option by text. " +
        "Two steps internally: 1) click the trigger to open the listbox; 2) click the option matching optionText. Both clicks use native HTMLElement.click() so portal-rendered options are reachable. " +
        "Identify the trigger by either triggerSelector or triggerText (not both). " +
        "Note: for native <select> elements use browser_eval instead — this tool targets ARIA-based custom dropdowns. " +
        "Returns { ok, optionText, elapsedMs }.",
    inputSchema: {
        type: "object",
        properties: {
            triggerSelector: {
                type: "string",
                description: "CSS selector for the trigger button (often button[role='combobox']).",
            },
            triggerText: {
                type: "string",
                description: "Visible text on the trigger (alternative to triggerSelector).",
            },
            optionText: {
                type: "string",
                description: "Visible text of the option to select.",
            },
        },
        required: ["optionText"],
    },
};
export async function selectOptionHandler(args) {
    const t0 = Date.now();
    if (!args.optionText)
        return fail("optionText is required.");
    if (!args.triggerSelector && !args.triggerText)
        return fail("Either triggerSelector or triggerText is required.");
    if (args.triggerSelector && args.triggerText)
        return fail("Provide either triggerSelector or triggerText, not both.");
    try {
        const state = await ensureAttached();
        const page = state.page;
        // 1) Open trigger
        const triggerLocator = args.triggerSelector
            ? page.locator(args.triggerSelector).first()
            : page
                .locator('button[role="combobox"]', { hasText: args.triggerText })
                .first();
        const openR = await safeClick(triggerLocator, {
            timeoutMs: 5000,
            stabilize: false,
        });
        if (!openR.ok) {
            return fail(`failed to open trigger: ${openR.error ?? "unknown"}`, {
                elapsedMs: Date.now() - t0,
            });
        }
        // 2) Wait for listbox / menu to render (best-effort)
        try {
            await page
                .locator('[role="listbox"], [role="menu"]')
                .first()
                .waitFor({ state: "visible", timeout: 2000 });
        }
        catch {
            // Some custom dropdowns don't expose role=listbox; fall through to option search.
        }
        // 3) Prefer exact-text match, then partial
        const exactRe = new RegExp(`^\\s*${escapeRegex(args.optionText)}\\s*$`);
        const exactOption = page
            .locator('[role="option"]')
            .filter({ hasText: exactRe })
            .first();
        let optionLocator = exactOption;
        const exactCount = await exactOption.count().catch(() => 0);
        if (exactCount === 0) {
            optionLocator = page
                .locator('[role="option"]')
                .filter({ hasText: args.optionText })
                .first();
        }
        // 4) Click option
        const pickR = await safeClick(optionLocator, {
            timeoutMs: 5000,
            stabilize: true,
        });
        if (!pickR.ok) {
            return fail(`failed to pick option "${args.optionText}": ${pickR.error ?? "unknown"}`, { elapsedMs: Date.now() - t0 });
        }
        return ok({
            ok: true,
            optionText: args.optionText,
            elapsedMs: Date.now() - t0,
        });
    }
    catch (e) {
        return fail(errMsg(e), { elapsedMs: Date.now() - t0 });
    }
}
// ===== browser_navigate ========================================
export const navigateDefinition = {
    name: "browser_navigate",
    description: "Navigate the attached page via page.goto() — clean alternative to location.href in browser_eval (which destroys the eval execution context mid-call). " +
        "Waits for 'load' then a brief networkIdle/animation settle. " +
        "Returns { ok, finalUrl, elapsedMs }.",
    inputSchema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "Absolute or relative URL to navigate to.",
            },
            timeoutMs: {
                type: "number",
                description: "Optional navigation timeout (default 10000ms).",
            },
        },
        required: ["url"],
    },
};
export async function navigateHandler(args) {
    if (!args.url)
        return fail("url is required.");
    const r = await navigate(args.url, args.timeoutMs);
    if (!r.ok)
        return fail(r.error ?? "navigate failed", { elapsedMs: r.elapsedMs });
    return ok({
        ok: true,
        finalUrl: r.finalUrl,
        elapsedMs: r.elapsedMs,
    });
}
//# sourceMappingURL=actions.js.map
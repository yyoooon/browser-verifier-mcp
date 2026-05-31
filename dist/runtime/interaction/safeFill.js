const DEFAULT_TIMEOUT_MS = 5000;
export async function safeFill(locator, value, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    try {
        await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
        await locator.fill(value, { timeout: timeoutMs });
        const final = await locator.inputValue({ timeout: 1000 }).catch(() => undefined);
        if (final === value) {
            return {
                ok: true,
                finalValue: final,
                usedFallback: false,
                elapsedMs: Date.now() - started,
            };
        }
        const fallback = await reactNativeSetterFallback(locator, value);
        return {
            ok: fallback.ok,
            finalValue: fallback.finalValue,
            usedFallback: true,
            elapsedMs: Date.now() - started,
            error: fallback.error,
        };
    }
    catch (primaryError) {
        const fallback = await reactNativeSetterFallback(locator, value).catch((e) => ({
            ok: false,
            finalValue: undefined,
            error: e instanceof Error ? e.message : String(e),
        }));
        return {
            ok: fallback.ok,
            finalValue: fallback.finalValue,
            usedFallback: true,
            elapsedMs: Date.now() - started,
            error: fallback.ok
                ? undefined
                : `${primaryError instanceof Error ? primaryError.message : String(primaryError)}; fallback: ${fallback.error ?? "unknown"}`,
        };
    }
}
async function reactNativeSetterFallback(locator, value) {
    try {
        const handle = await locator.elementHandle({ timeout: 1000 });
        if (!handle) {
            return { ok: false, error: "element not found for fallback" };
        }
        const result = await handle.evaluate((el, v) => {
            if (!(el instanceof HTMLInputElement) &&
                !(el instanceof HTMLTextAreaElement)) {
                return { ok: false, error: "fallback only supports input/textarea" };
            }
            const proto = el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
            const setter = descriptor?.set;
            if (!setter)
                return { ok: false, error: "native setter unavailable" };
            setter.call(el, v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return { ok: true, finalValue: el.value };
        }, value);
        await handle.dispose();
        return result;
    }
    catch (e) {
        return {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
//# sourceMappingURL=safeFill.js.map
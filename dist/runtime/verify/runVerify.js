import { extractSemanticState, } from "../semantic/extractSemanticState.js";
import { globMatch } from "../../lib/glob.js";
const DOM_CHECK_TYPES = new Set([
    "computed_style",
    "class_present",
    "class_absent",
]);
export async function runVerify(page, checks) {
    const t0 = Date.now();
    let state = await extractSemanticState(page);
    const needsLoadedRetry = checks.find((c) => c.type === "loaded");
    if (needsLoadedRetry &&
        state.loading &&
        (needsLoadedRetry.timeoutMs ?? 0) > 0) {
        state = await pollLoaded(page, needsLoadedRetry.timeoutMs ?? 0, state);
    }
    const domQueries = [];
    checks.forEach((c, idx) => {
        if (c.type === "computed_style") {
            domQueries.push({
                idx,
                kind: "style",
                selector: c.selector,
                prop: c.prop,
            });
        }
        else if (c.type === "class_present" || c.type === "class_absent") {
            domQueries.push({
                idx,
                kind: "class",
                selector: c.selector,
                className: c.className,
            });
        }
    });
    const domResultsByIdx = new Map();
    if (domQueries.length > 0) {
        const raw = await runDomQueries(page, domQueries);
        for (const r of raw)
            domResultsByIdx.set(r.idx, r);
    }
    const results = checks.map((c, idx) => {
        if (DOM_CHECK_TYPES.has(c.type)) {
            return runDomCheck(c, domResultsByIdx.get(idx));
        }
        return runStateCheck(c, state);
    });
    return {
        ok: results.every((r) => r.ok),
        checks: results,
        state,
        elapsedMs: Date.now() - t0,
    };
}
async function pollLoaded(page, timeoutMs, initial) {
    const started = Date.now();
    let state = initial;
    while (state.loading && Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, 150));
        state = await extractSemanticState(page);
    }
    return state;
}
async function runDomQueries(page, queries) {
    return page.evaluate((qs) => {
        return qs.map((q) => {
            const el = document.querySelector(q.selector);
            if (!el)
                return { idx: q.idx, found: false };
            if (q.kind === "style" && q.prop) {
                const cs = getComputedStyle(el);
                const csAny = cs;
                let value = csAny[q.prop];
                if (value === undefined || value === "") {
                    const kebab = q.prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
                    value = cs.getPropertyValue(kebab).trim();
                }
                return { idx: q.idx, found: true, computed: value };
            }
            if (q.kind === "class" && q.className) {
                return {
                    idx: q.idx,
                    found: true,
                    hasClass: el.classList.contains(q.className),
                };
            }
            return { idx: q.idx, found: false };
        });
    }, queries);
}
function runDomCheck(check, result) {
    if (check.type !== "computed_style" &&
        check.type !== "class_present" &&
        check.type !== "class_absent") {
        return { type: check.type, ok: false, message: "internal: not a dom check" };
    }
    if (!result || !result.found) {
        return {
            type: check.type,
            ok: false,
            message: `selector "${check.selector}" not found`,
        };
    }
    if (check.type === "computed_style") {
        const got = result.computed ?? "";
        const ok = got === check.expected;
        return {
            type: "computed_style",
            ok,
            message: ok
                ? undefined
                : `${check.prop}: expected "${check.expected}" got "${got}"`,
            observed: got,
        };
    }
    if (check.type === "class_present") {
        const ok = result.hasClass === true;
        return {
            type: "class_present",
            ok,
            message: ok
                ? undefined
                : `class "${check.className}" not present on "${check.selector}"`,
        };
    }
    // class_absent
    const ok = result.hasClass === false;
    return {
        type: "class_absent",
        ok,
        message: ok
            ? undefined
            : `class "${check.className}" unexpectedly present on "${check.selector}"`,
    };
}
function runStateCheck(check, state) {
    switch (check.type) {
        case "primary_cta": {
            if (!state.primaryCTA) {
                return {
                    type: "primary_cta",
                    ok: false,
                    message: "no primary CTA detected",
                };
            }
            if (check.expectedText) {
                const got = state.primaryCTA.text;
                if (!got.includes(check.expectedText)) {
                    return {
                        type: "primary_cta",
                        ok: false,
                        message: `primary CTA text "${got}" does not include "${check.expectedText}"`,
                        observed: state.primaryCTA,
                    };
                }
            }
            if (check.mustBeEnabled && !state.primaryCTA.enabled) {
                return {
                    type: "primary_cta",
                    ok: false,
                    message: "primary CTA is disabled",
                    observed: state.primaryCTA,
                };
            }
            return {
                type: "primary_cta",
                ok: true,
                observed: state.primaryCTA,
            };
        }
        case "no_errors": {
            if (state.errors.length === 0) {
                return { type: "no_errors", ok: true };
            }
            return {
                type: "no_errors",
                ok: false,
                message: `${state.errors.length} error message(s) on page`,
                observed: state.errors,
            };
        }
        case "loaded": {
            if (!state.loading)
                return { type: "loaded", ok: true };
            return {
                type: "loaded",
                ok: false,
                message: "page still loading",
                observed: state.loadingHints,
            };
        }
        case "route": {
            const candidates = [
                state.route,
                state.route + state.search,
                state.route + state.search + state.hash,
            ];
            const ok = candidates.some((c) => globMatch(check.expected, c));
            return {
                type: "route",
                ok,
                message: ok
                    ? undefined
                    : `route "${state.route}" does not match "${check.expected}"`,
                observed: state.route,
            };
        }
        case "modal_open": {
            if (!state.modal || !state.modal.visible) {
                return {
                    type: "modal_open",
                    ok: false,
                    message: "no modal open",
                };
            }
            if (check.expectedTitle &&
                !state.modal.title.includes(check.expectedTitle)) {
                return {
                    type: "modal_open",
                    ok: false,
                    message: `modal title "${state.modal.title}" does not include "${check.expectedTitle}"`,
                    observed: state.modal,
                };
            }
            return { type: "modal_open", ok: true, observed: state.modal };
        }
        case "modal_closed": {
            if (state.modal && state.modal.visible) {
                return {
                    type: "modal_closed",
                    ok: false,
                    message: "modal is open",
                    observed: state.modal,
                };
            }
            return { type: "modal_closed", ok: true };
        }
        case "heading_present": {
            const found = state.headings.some((h) => h.includes(check.text));
            return {
                type: "heading_present",
                ok: found,
                message: found
                    ? undefined
                    : `heading containing "${check.text}" not found`,
                observed: state.headings,
            };
        }
        case "input_count": {
            const n = state.inputCount;
            if (check.exact !== undefined && n !== check.exact) {
                return {
                    type: "input_count",
                    ok: false,
                    message: `expected exactly ${check.exact} inputs, found ${n}`,
                    observed: n,
                };
            }
            if (check.min !== undefined && n < check.min) {
                return {
                    type: "input_count",
                    ok: false,
                    message: `expected at least ${check.min} inputs, found ${n}`,
                    observed: n,
                };
            }
            if (check.max !== undefined && n > check.max) {
                return {
                    type: "input_count",
                    ok: false,
                    message: `expected at most ${check.max} inputs, found ${n}`,
                    observed: n,
                };
            }
            return { type: "input_count", ok: true, observed: n };
        }
        default: {
            return {
                type: check.type,
                ok: false,
                message: "internal: unknown state check type",
            };
        }
    }
}
//# sourceMappingURL=runVerify.js.map
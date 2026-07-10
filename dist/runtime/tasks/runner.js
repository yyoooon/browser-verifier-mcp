import { ensureAttached } from "../client.js";
import { clickByText, clickAndWaitForUrl, fillReactInput, navigate, pressKey, reload, selectOption, } from "../../cdp/actions.js";
import { waitForGone, waitForLoad, waitForSelector, waitForText, waitForUrl, } from "../../cdp/wait.js";
import { runVerify } from "../verify/runVerify.js";
import { captureScreenshot } from "../screenshot.js";
import { getTask } from "./registry.js";
const TEMPLATE_RE = /\{\{(\w+)\}\}/g;
export async function runTask(name, args = {}) {
    const task = getTask(name);
    if (!task) {
        throw new Error(`task "${name}" not loaded. Use browser_load_tasks first.`);
    }
    return executeSteps(name, task.steps, args);
}
export async function runInlineSteps(steps, args = {}) {
    return executeSteps("inline", steps, args);
}
async function executeSteps(name, steps, args) {
    const t0 = Date.now();
    const records = [];
    for (let i = 0; i < steps.length; i++) {
        const step = substituteArgs(steps[i], args);
        const sT0 = Date.now();
        try {
            const result = await executeStep(step);
            const ok = stepOk(result);
            records.push({
                index: i,
                op: step.op,
                ok,
                result,
                elapsedMs: Date.now() - sT0,
                error: ok ? undefined : extractError(result),
            });
            if (!ok) {
                return {
                    ok: false,
                    name,
                    steps: records,
                    failedAt: i,
                    elapsedMs: Date.now() - t0,
                };
            }
        }
        catch (e) {
            records.push({
                index: i,
                op: step.op,
                ok: false,
                elapsedMs: Date.now() - sT0,
                error: e instanceof Error ? e.message : String(e),
            });
            return {
                ok: false,
                name,
                steps: records,
                failedAt: i,
                elapsedMs: Date.now() - t0,
            };
        }
    }
    return { ok: true, name, steps: records, elapsedMs: Date.now() - t0 };
}
function substituteArgs(step, args) {
    return JSON.parse(JSON.stringify(step, (_k, v) => {
        if (typeof v !== "string")
            return v;
        return v.replace(TEMPLATE_RE, (match, key) => {
            if (Object.prototype.hasOwnProperty.call(args, key)) {
                return String(args[key]);
            }
            return match;
        });
    }));
}
async function executeStep(step) {
    switch (step.op) {
        case "goto":
            return await navigate(step.url, step.timeoutMs);
        case "click":
            return await clickByText(step.text);
        case "fill":
            return await fillReactInput(step.selector, step.value);
        case "navigate":
            return await clickAndWaitForUrl(step.clickText, step.expectedUrl, step.timeoutMs);
        case "reload":
            return await reload();
        case "wait_url":
            return await waitForUrl(step.pattern ?? step.url, step.timeoutMs);
        case "wait_text":
            return await waitForText(step.text, step.timeoutMs);
        case "wait_selector":
            return await waitForSelector(step.selector, step.timeoutMs);
        case "wait_gone":
            return await waitForGone(step.selector, step.timeoutMs);
        case "wait_load":
            return await waitForLoad(step.state ?? "load", step.timeoutMs);
        case "press_key":
            return await pressKey(step.key, step.selector);
        case "select_option":
            return await selectOption(step.selector, {
                value: step.value,
                label: step.label,
            });
        case "verify": {
            const state = await ensureAttached();
            return await runVerify(state.page, step.checks);
        }
        case "screenshot":
            return await captureScreenshot({
                name: step.name,
                fullPage: step.fullPage,
                format: step.format,
                quality: step.quality,
            });
    }
}
function stepOk(result) {
    if (result && typeof result === "object" && "ok" in result) {
        return Boolean(result.ok);
    }
    return true;
}
function extractError(result) {
    if (result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string") {
        return result.error;
    }
    return "step returned ok=false";
}
//# sourceMappingURL=runner.js.map
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const KNOWN_OPS = new Set([
    "goto",
    "click",
    "fill",
    "navigate",
    "reload",
    "wait_url",
    "wait_text",
    "wait_selector",
    "wait_load",
    "verify",
    "screenshot",
]);
export function loadTasksFromFile(path) {
    const abs = resolve(path);
    const text = readFileSync(abs, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    }
    catch (e) {
        throw new Error(`failed to parse tasks JSON at ${abs}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const validated = validateTasksFile(data);
    return { tasks: validated.tasks, warnings: validated.warnings, path: abs };
}
export function validateTasksFile(data) {
    const warnings = [];
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        warnings.push("tasks file must be a JSON object at top level");
        return { tasks: {}, warnings };
    }
    const tasks = {};
    for (const [name, raw] of Object.entries(data)) {
        const v = validateTask(name, raw);
        warnings.push(...v.warnings);
        if (v.task)
            tasks[name] = v.task;
    }
    return { tasks, warnings };
}
function validateTask(name, raw) {
    const warnings = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        warnings.push(`task "${name}": value must be an object`);
        return { warnings };
    }
    const obj = raw;
    if (!Array.isArray(obj.steps)) {
        warnings.push(`task "${name}": missing or non-array "steps"`);
        return { warnings };
    }
    const steps = [];
    for (let i = 0; i < obj.steps.length; i++) {
        const step = obj.steps[i];
        if (!step || typeof step !== "object") {
            warnings.push(`task "${name}" step ${i}: not an object`);
            continue;
        }
        const s = step;
        if (typeof s.op !== "string" || !KNOWN_OPS.has(s.op)) {
            warnings.push(`task "${name}" step ${i}: unknown op "${String(s.op)}" (allowed: ${[
                ...KNOWN_OPS,
            ].join(", ")})`);
            continue;
        }
        const missing = requiredFieldsMissing(s);
        if (missing.length) {
            warnings.push(`task "${name}" step ${i} (${s.op}): missing required field(s): ${missing.join(", ")}`);
            continue;
        }
        steps.push(s);
    }
    if (steps.length === 0) {
        warnings.push(`task "${name}": no valid steps after validation`);
        return { warnings };
    }
    const task = {
        description: typeof obj.description === "string" ? obj.description : undefined,
        args: Array.isArray(obj.args)
            ? obj.args.filter((a) => typeof a === "string")
            : undefined,
        steps,
    };
    return { task, warnings };
}
function requiredFieldsMissing(step) {
    switch (step.op) {
        case "goto":
            return typeof step.url === "string" ? [] : ["url"];
        case "click":
            return typeof step.text === "string" ? [] : ["text"];
        case "fill":
            return [
                ...(typeof step.selector === "string" ? [] : ["selector"]),
                ...(typeof step.value === "string" ? [] : ["value"]),
            ];
        case "navigate":
            return [
                ...(typeof step.clickText === "string" ? [] : ["clickText"]),
                ...(typeof step.expectedUrl === "string" ? [] : ["expectedUrl"]),
            ];
        case "reload":
            return [];
        case "wait_url":
            return typeof step.pattern === "string" ? [] : ["pattern"];
        case "wait_text":
            return typeof step.text === "string" ? [] : ["text"];
        case "wait_selector":
            return typeof step.selector === "string" ? [] : ["selector"];
        case "wait_load":
            return [];
        case "verify":
            return Array.isArray(step.checks) ? [] : ["checks"];
        case "screenshot":
            return [];
    }
}
//# sourceMappingURL=loader.js.map
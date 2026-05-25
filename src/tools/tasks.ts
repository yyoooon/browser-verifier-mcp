import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  loadTasksFromFile,
  type LoadResult,
} from "../runtime/tasks/loader.js";
import {
  getSourcePath,
  getTasks,
  setTasks,
} from "../runtime/tasks/registry.js";
import { runTask, runInlineSteps } from "../runtime/tasks/runner.js";
import type { TaskOp } from "../runtime/tasks/types.js";
import { ok, fail } from "../lib/result.js";

export const loadDefinition: Tool = {
  name: "browser_load_tasks",
  description:
    "Load declarative task definitions from a JSON file (replaces any currently loaded tasks). The file shape is { taskName: { description?, args?, steps: [...] } }. Each step is { op, ...fields } using the same ops as browser_batch (goto/click/fill/navigate/reload/wait_url/wait_text/wait_selector/wait_load/verify/screenshot). String fields support {{argName}} substitution at run time. Returns the list of task names loaded plus any validation warnings.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the tasks JSON file.",
      },
    },
    required: ["path"],
  },
};

export async function loadHandler(args: { path: string }) {
  try {
    const result: LoadResult = loadTasksFromFile(args.path);
    setTasks(result.tasks, result.path);
    return ok({
      ok: true,
      path: result.path,
      loaded: Object.keys(result.tasks),
      count: Object.keys(result.tasks).length,
      warnings: result.warnings,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), {
      path: args.path,
    });
  }
}

export const listDefinition: Tool = {
  name: "browser_list_tasks",
  description:
    "List currently loaded tasks with their description, declared args, and step count. Use this to discover what tasks are available before calling browser_run_task.",
  inputSchema: { type: "object", properties: {} },
};

export async function listHandler() {
  const tasks = getTasks();
  const sourcePath = getSourcePath();
  return ok({
    ok: true,
    sourcePath,
    count: Object.keys(tasks).length,
    tasks: Object.entries(tasks).map(([name, def]) => ({
      name,
      description: def.description,
      args: def.args ?? [],
      stepCount: def.steps.length,
    })),
  });
}

export const runDefinition: Tool = {
  name: "browser_run_task",
  description:
    "Execute task steps deterministically (bail on first failure). Two modes:\n" +
    "  - Named: { name: 'taskName', args? } — run a task previously loaded via browser_load_tasks.\n" +
    "  - Inline: { steps: [...], args? } — pass step array directly; no file / no registration needed. Use this for one-off interactive flows (click → wait → verify mixed) without committing a task file.\n" +
    "Step shape (same as tasks.json): { op: 'goto'|'click'|'fill'|'navigate'|'reload'|'wait_url'|'wait_text'|'wait_selector'|'wait_load'|'verify'|'screenshot', ...opFields }. Fields support {{argName}} substitution from args. Both modes return { ok, name, steps: [...], failedAt?, elapsedMs }; inline name is 'inline'.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of a previously-loaded task. Provide name OR steps.",
      },
      steps: {
        type: "array",
        description:
          "Inline step list (same shape as task steps). Provide name OR steps.",
        items: {
          type: "object",
          properties: { op: { type: "string" } },
          required: ["op"],
          additionalProperties: true,
        },
      },
      args: {
        type: "object",
        description:
          "Key/value map. Values get coerced to strings during {{argName}} substitution.",
        additionalProperties: true,
      },
    },
  },
};

export async function runHandler(args: {
  name?: string;
  steps?: TaskOp[];
  args?: Record<string, unknown>;
}) {
  try {
    const hasName = typeof args.name === "string" && args.name.length > 0;
    const hasSteps = Array.isArray(args.steps) && args.steps.length > 0;
    if (!hasName && !hasSteps) {
      return fail("must provide either 'name' (registered task) or 'steps' (inline)");
    }
    if (hasName && hasSteps) {
      return fail("provide only one of 'name' or 'steps', not both");
    }

    const result = hasName
      ? await runTask(args.name!, args.args ?? {})
      : await runInlineSteps(args.steps!, args.args ?? {});

    if (result.ok) return ok(result);

    const label = hasName ? `task "${args.name}"` : "inline steps";
    return fail(`${label} failed at step ${result.failedAt}`, {
      name: result.name,
      steps: result.steps,
      failedAt: result.failedAt,
      elapsedMs: result.elapsedMs,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), {
      name: args.name,
    });
  }
}

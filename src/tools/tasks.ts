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
import { runTask } from "../runtime/tasks/runner.js";
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
    "Execute a loaded task by name with the given args. String args are substituted into {{argName}} placeholders inside step fields. Runs deterministically, stops on first failed step, returns { ok, name, steps: [...], failedAt?, elapsedMs }. Each step record includes op, ok, elapsedMs and the inner result.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      args: {
        type: "object",
        description:
          "Key/value map. Values get coerced to strings during substitution.",
        additionalProperties: true,
      },
    },
    required: ["name"],
  },
};

export async function runHandler(args: {
  name: string;
  args?: Record<string, unknown>;
}) {
  try {
    const result = await runTask(args.name, args.args ?? {});
    return result.ok
      ? ok(result)
      : fail(`task "${args.name}" failed at step ${result.failedAt}`, {
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

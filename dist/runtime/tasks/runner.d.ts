import type { TaskOp, TaskRunResult } from "./types.js";
export declare function runTask(name: string, args?: Record<string, unknown>): Promise<TaskRunResult>;
export declare function runInlineSteps(steps: TaskOp[], args?: Record<string, unknown>): Promise<TaskRunResult>;

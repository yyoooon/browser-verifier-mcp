import type { VerifyCheck } from "../verify/types.js";

export type TaskOp =
  | { op: "goto"; url: string; timeoutMs?: number }
  | { op: "click"; text: string }
  | { op: "fill"; selector: string; value: string }
  | {
      op: "navigate";
      clickText: string;
      expectedUrl: string;
      timeoutMs?: number;
    }
  | { op: "reload" }
  | { op: "wait_url"; pattern: string; timeoutMs?: number }
  | { op: "wait_text"; text: string; timeoutMs?: number }
  | { op: "wait_selector"; selector: string; timeoutMs?: number }
  | {
      op: "wait_load";
      state?: "load" | "domcontentloaded" | "networkidle" | "hydrated";
      timeoutMs?: number;
    }
  | { op: "verify"; checks: VerifyCheck[] }
  | {
      op: "screenshot";
      name?: string;
      fullPage?: boolean;
      format?: "jpeg" | "png";
      quality?: number;
    };

export interface TaskDefinition {
  description?: string;
  args?: string[];
  steps: TaskOp[];
}

export type TasksFile = Record<string, TaskDefinition>;

export interface StepRecord {
  index: number;
  op: TaskOp["op"];
  ok: boolean;
  elapsedMs: number;
  result?: unknown;
  error?: string;
}

export interface TaskRunResult {
  ok: boolean;
  name: string;
  steps: StepRecord[];
  elapsedMs: number;
  failedAt?: number;
}

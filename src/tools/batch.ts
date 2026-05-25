import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { evalInBrowser } from "../cdp/eval.js";
import {
  clickByText,
  clickAndWaitForUrl,
  fillReactInput,
  navigate,
  reload,
} from "../cdp/actions.js";
import {
  waitForUrl,
  waitForText,
  waitForSelector,
  waitForLoad,
} from "../cdp/wait.js";
import {
  compileFlow,
  type FlowResult,
  type FlowStep,
  type InspectTargetSpec,
} from "../cdp/flow-compiler.js";
import { applyPayloadGuard } from "../lib/payload-guard.js";
import { ok, fail } from "../lib/result.js";

type BatchOp =
  | { op: "click"; text: string }
  | {
      op: "navigate";
      clickText: string;
      expectedUrl: string;
      timeoutMs?: number;
    }
  | { op: "fill"; selector: string; value: string }
  | { op: "goto"; url: string; timeoutMs?: number }
  | { op: "reload" }
  | { op: "eval"; script: string; timeoutMs?: number }
  | { op: "wait_url"; pattern: string; timeoutMs?: number }
  | { op: "wait_text"; text: string; timeoutMs?: number }
  | { op: "wait_selector"; selector: string; timeoutMs?: number }
  | {
      op: "wait_load";
      state?: "load" | "domcontentloaded" | "networkidle" | "hydrated";
      timeoutMs?: number;
    }
  | { op: "get_url" }
  | { op: "sleep"; ms: number }
  | { op: "inspect"; targets: Record<string, InspectTargetSpec> };

const DEFAULT_MAX_BYTES = 60_000;

export const definition: Tool = {
  name: "browser_batch",
  description:
    'Run a sequence of browser operations against the attached CDP target. Stops on first failure. Same-page op bundles (click / wait_url / wait_text / wait_selector / eval / get_url / sleep / inspect) are auto-compiled into a single Runtime.evaluate call for speed; navigation ops (goto / reload / navigate / fill / wait_load) execute individually. Each op runs sequentially. Add { op: "inspect", targets: { key: { selector, style?, text?, classList?, rect?, attr? } } } to extract computed style / text / classList / rect / attrs of multiple elements in one call — useful for design-spec comparison.',
  inputSchema: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        description:
          'Sequence of ops. Each op is { op: "<name>", ...args }. Names: click, navigate, fill, goto, reload, eval, wait_url, wait_text, wait_selector, wait_load, get_url, sleep, inspect.',
        items: { type: "object" },
      },
      stopOnFail: {
        type: "boolean",
        description: "Stop on first op failure (default true).",
      },
      maxBytes: {
        type: "number",
        description:
          "Auto-truncate large string fields in the response if total exceeds this (default 60000). Set 0 to disable.",
      },
    },
    required: ["ops"],
  },
};

const BOUNDARY_OPS = new Set([
  "navigate",
  "goto",
  "reload",
  "fill",
  "wait_load",
]);

type StepRecord = {
  op: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  elapsedMs: number;
};

export async function handler(args: {
  ops: BatchOp[];
  stopOnFail?: boolean;
  maxBytes?: number;
}) {
  const t0 = Date.now();
  const stop = args.stopOnFail !== false;
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const steps: StepRecord[] = [];

  const chunks = chunkOps(args.ops);
  let globalStepIndex = 0;

  for (const chunk of chunks) {
    if (chunk.length === 1 && chunk[0]!.op !== "inspect") {
      // single op (boundary or one-shot flow op) → use existing per-op handlers
      const op = chunk[0]!;
      const stepT0 = Date.now();
      try {
        const result = await runSingleOp(op);
        const record: StepRecord = {
          op: op.op,
          ok: result.ok,
          data: result.ok ? result.data : undefined,
          error: result.ok ? undefined : result.error,
          elapsedMs: Date.now() - stepT0,
        };
        steps.push(record);
        globalStepIndex++;
        if (!result.ok && stop) {
          const payload = applyPayloadGuard(
            { steps, totalMs: Date.now() - t0 },
            maxBytes || Infinity,
          ) as Record<string, unknown>;
          return fail(
            `step ${globalStepIndex} (${op.op}) failed: ${result.error}`,
            payload,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push({
          op: op.op,
          ok: false,
          error: msg,
          elapsedMs: Date.now() - stepT0,
        });
        globalStepIndex++;
        if (stop) {
          const payload = applyPayloadGuard(
            { steps, totalMs: Date.now() - t0 },
            maxBytes || Infinity,
          ) as Record<string, unknown>;
          return fail(
            `step ${globalStepIndex} (${op.op}) threw: ${msg}`,
            payload,
          );
        }
      }
      continue;
    }

    // flow-eligible chunk (>1 op, or contains inspect) → compile to single eval
    const chunkT0 = Date.now();
    const flowResult = await runFlowChunk(chunk);
    const ms = Date.now() - chunkT0;
    const expanded = expandFlowResult(chunk, flowResult, ms);
    steps.push(...expanded);
    const failedAt = flowResult?.failedAt;
    globalStepIndex += chunk.length;
    if (failedAt !== undefined && stop) {
      const failedOp = chunk[failedAt];
      const errMark = flowResult!.marks.find((m) => m.i === failedAt);
      const payload = applyPayloadGuard(
        {
          steps,
          snapshot: flowResult!.snapshot,
          totalMs: Date.now() - t0,
        },
        maxBytes || Infinity,
      ) as Record<string, unknown>;
      return fail(
        `step ${failedAt + 1} (${failedOp?.op}) failed: ${errMark?.error ?? "flow step failed"}`,
        payload,
      );
    }
  }

  return ok(
    applyPayloadGuard(
      { ok: true, steps, totalMs: Date.now() - t0 },
      maxBytes || Infinity,
    ),
  );
}

function chunkOps(ops: BatchOp[]): BatchOp[][] {
  const chunks: BatchOp[][] = [];
  let current: BatchOp[] = [];
  for (const op of ops) {
    if (BOUNDARY_OPS.has(op.op)) {
      if (current.length) {
        chunks.push(current);
        current = [];
      }
      chunks.push([op]);
    } else {
      current.push(op);
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function toFlowStep(op: BatchOp): FlowStep | null {
  switch (op.op) {
    case "click":
      return { click: { text: op.text } };
    case "eval":
      return { eval: op.script };
    case "sleep":
      return { sleep: op.ms };
    case "get_url":
      return { getUrl: true };
    case "wait_url":
      return { waitFor: { url: op.pattern }, timeout: op.timeoutMs };
    case "wait_text":
      return { waitFor: { text: op.text }, timeout: op.timeoutMs };
    case "wait_selector":
      return { waitFor: { selector: op.selector }, timeout: op.timeoutMs };
    case "inspect":
      return { inspect: op.targets };
    default:
      return null;
  }
}

async function runFlowChunk(chunk: BatchOp[]): Promise<FlowResult | null> {
  const flowSteps: FlowStep[] = [];
  for (const op of chunk) {
    const fs = toFlowStep(op);
    if (!fs) return null;
    flowSteps.push(fs);
  }
  const script = compileFlow({ steps: flowSteps });
  const maxStepTimeout = Math.max(
    ...chunk.map((op) =>
      "timeoutMs" in op && op.timeoutMs ? op.timeoutMs : 5000,
    ),
  );
  const r = await evalInBrowser(script, maxStepTimeout + 5000);
  if (!r.ok) {
    return {
      marks: chunk.map((op, i) => ({
        i,
        kind: op.op,
        ok: false,
        ms: 0,
        error: r.error,
      })),
      totalMs: 0,
      failedAt: 0,
    };
  }
  return r.value as FlowResult;
}

function expandFlowResult(
  chunk: BatchOp[],
  flow: FlowResult | null,
  totalMs: number,
): StepRecord[] {
  if (!flow) {
    return chunk.map((op) => ({
      op: op.op,
      ok: false,
      error: "flow compile error",
      elapsedMs: 0,
    }));
  }
  const records: StepRecord[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const op = chunk[i]!;
    const mark = flow.marks.find((m) => m.i === i);
    if (!mark) {
      records.push({
        op: op.op,
        ok: false,
        error: "step not executed",
        elapsedMs: 0,
      });
      continue;
    }
    const data = extractStepData(op, i, mark, flow.stepResults);
    records.push({
      op: op.op,
      ok: mark.ok,
      data: mark.ok ? data : undefined,
      error: mark.ok ? undefined : (mark.error as string | undefined),
      elapsedMs: mark.ms,
    });
  }
  // sanity: include total wall-clock somewhere — already in mark.ms per step
  void totalMs;
  return records;
}

function extractStepData(
  op: BatchOp,
  index: number,
  mark: FlowResult["marks"][number],
  stepResults?: Record<number, unknown>,
): unknown {
  switch (op.op) {
    case "click":
      return {
        matched: 1,
        hydrated: mark.hydrated,
        clickedText: op.text.slice(0, 80),
      };
    case "eval":
      return { value: stepResults?.[index] };
    case "get_url":
      return { url: stepResults?.[index] };
    case "inspect":
      return stepResults?.[index] ?? {};
    case "wait_url":
    case "wait_text":
    case "wait_selector":
    case "sleep":
      return {};
    default:
      return {};
  }
}

type OpResult = { ok: true; data: unknown } | { ok: false; error: string };

async function runSingleOp(op: BatchOp): Promise<OpResult> {
  switch (op.op) {
    case "click": {
      const r = await clickByText(op.text);
      return r.ok
        ? {
            ok: true,
            data: {
              matched: r.matched,
              clickedText: r.clickedText,
              hydrated: r.hydrated,
              waitedMs: r.waitedMs,
            },
          }
        : { ok: false, error: r.error ?? "click failed" };
    }
    case "navigate": {
      const r = await clickAndWaitForUrl(
        op.clickText,
        op.expectedUrl,
        op.timeoutMs,
      );
      return r.ok
        ? { ok: true, data: { finalUrl: r.finalUrl } }
        : { ok: false, error: r.error ?? "navigate failed" };
    }
    case "fill": {
      const r = await fillReactInput(op.selector, op.value);
      return r.ok
        ? { ok: true, data: { finalValue: r.finalValue } }
        : { ok: false, error: r.error ?? "fill failed" };
    }
    case "goto": {
      const r = await navigate(op.url, op.timeoutMs);
      return r.ok
        ? { ok: true, data: { finalUrl: r.finalUrl } }
        : { ok: false, error: r.error ?? "goto failed" };
    }
    case "reload": {
      const r = await reload();
      return r.ok
        ? { ok: true, data: { finalUrl: r.finalUrl } }
        : { ok: false, error: r.error ?? "reload failed" };
    }
    case "eval": {
      const r = await evalInBrowser(op.script, op.timeoutMs);
      return r.ok
        ? { ok: true, data: { value: r.value } }
        : { ok: false, error: r.error };
    }
    case "wait_url": {
      const r = await waitForUrl(op.pattern, op.timeoutMs);
      return r.ok
        ? { ok: true, data: { url: r.finalValue } }
        : { ok: false, error: r.error ?? "wait_url failed" };
    }
    case "wait_text": {
      const r = await waitForText(op.text, op.timeoutMs);
      return r.ok
        ? { ok: true, data: {} }
        : { ok: false, error: r.error ?? "wait_text failed" };
    }
    case "wait_selector": {
      const r = await waitForSelector(op.selector, op.timeoutMs);
      return r.ok
        ? { ok: true, data: {} }
        : { ok: false, error: r.error ?? "wait_selector failed" };
    }
    case "wait_load": {
      const r = await waitForLoad(op.state, op.timeoutMs);
      return r.ok
        ? { ok: true, data: {} }
        : { ok: false, error: r.error ?? "wait_load failed" };
    }
    case "get_url": {
      const r = await evalInBrowser("location.href", 1000);
      return r.ok
        ? { ok: true, data: { url: r.value } }
        : { ok: false, error: r.error };
    }
    case "sleep": {
      await new Promise((r) => setTimeout(r, op.ms));
      return { ok: true, data: {} };
    }
    case "inspect": {
      // single inspect → just run it through the flow path
      const flow = await runFlowChunk([op]);
      const mark = flow?.marks[0];
      if (!flow || !mark || !mark.ok) {
        return { ok: false, error: mark?.error ?? "inspect failed" };
      }
      return { ok: true, data: flow.stepResults?.[0] ?? {} };
    }
  }
  // Unreachable in practice — exhaustive switch.
  return { ok: false, error: "unknown op" };
}

/**
 * Flow compiler — adapted from webview-test-mcp.
 *
 * Compiles a sequence of declarative steps into a single async IIFE string that
 * runs via one Runtime.evaluate call. Eliminates per-op MCP/CDP roundtrip cost
 * for "same-page" step bundles (click + wait + eval + inspect).
 *
 * Boundary ops (goto / reload / navigate / fill / wait_load) are NOT supported
 * here — they invalidate the JS execution context and must run separately. The
 * caller (tools/batch.ts) is responsible for splitting at boundaries.
 */

import {
  selectorSnippet,
  fuzzyCandidatesSnippet,
  VISIBLE_FILTER_JS,
  IS_HYDRATED_JS,
  type Selector,
} from "../lib/selector.js";

export interface ClickStep {
  click: Selector;
}
export interface EvalStep {
  eval: string;
}
export interface SleepStep {
  sleep: number;
}
export interface WaitForStep {
  waitFor: WaitCond;
  timeout?: number;
}
export interface GetUrlStep {
  getUrl: true;
}
export interface InspectStep {
  /**
   * Figma spec 비교용. 한 콜에 여러 selector의 computed style / text / classList / rect / attr 추출.
   * 키는 자유롭게 (예: title, badge, ctaButton). 결과는 같은 키로 평탄하게 반환.
   */
  inspect: Record<string, InspectTargetSpec>;
}

export interface InspectTargetSpec {
  /** CSS selector (string only — Selector DSL은 inspect에는 미적용, 정확한 단일 매칭이 목적). */
  selector: string;
  /** getComputedStyle 프로퍼티. 예: ['fontSize', 'fontWeight', 'marginTop']. */
  style?: string[];
  /** true면 textContent 포함. */
  text?: boolean;
  /** true면 classList 배열 포함. */
  classList?: boolean;
  /** true면 x/y/width/height, 또는 부분 선택 (['width','height']). */
  rect?: boolean | string[];
  /** HTML 속성 이름 배열. 예: ['data-state', 'aria-label']. */
  attr?: string[];
}

export type FlowStep =
  | ClickStep
  | EvalStep
  | SleepStep
  | WaitForStep
  | GetUrlStep
  | InspectStep;

export type WaitCond =
  | { selector: string }
  | { text: string; within?: string }
  | { role: string }
  | { gone: string }
  | { url: string };

export interface FlowInput {
  steps: FlowStep[];
  bail?: "on-error" | "continue";
}

export interface FlowResult {
  marks: Array<{
    i: number;
    kind: string;
    ok: boolean;
    ms: number;
    error?: string;
    [k: string]: unknown;
  }>;
  totalMs: number;
  /** Per-step results keyed by step index. eval → value, get_url → url string, inspect → values map. */
  stepResults?: Record<number, unknown>;
  failedAt?: number;
  snapshot?: {
    url: string;
    dialogPresent: boolean;
    visibleButtons: string[];
    headings: string[];
  };
}

const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const DEFAULT_HYDRATION_TIMEOUT_MS = 1500;

function escJson(value: unknown): string {
  return JSON.stringify(value);
}

function compileStep(step: FlowStep, index: number): string {
  if ("click" in step) {
    const sel = selectorSnippet(step.click);
    return `
      const __t = performance.now();
      const __findEl = () => ${sel};
      let __el = __findEl();
      if (!__el) {
        const __sim = ${fuzzyCandidatesSnippet()};
        marks.push({ i: ${index}, kind: 'click', ok: false, ms: Math.round(performance.now() - __t), error: 'SELECTOR_NOT_FOUND', similar: __sim });
        return { failed: ${index} };
      }
      const __isHy = ${IS_HYDRATED_JS};
      let __hydrated = __isHy(__el);
      const __hydEnd = performance.now() + ${DEFAULT_HYDRATION_TIMEOUT_MS};
      while (!__hydrated && performance.now() < __hydEnd) {
        await new Promise((r) => setTimeout(r, 50));
        __el = __findEl() || __el;
        __hydrated = __isHy(__el);
      }
      __el.scrollIntoView({ block: 'center', inline: 'center' });
      __el.click();
      marks.push({ i: ${index}, kind: 'click', ok: true, ms: Math.round(performance.now() - __t), hydrated: __hydrated });
    `;
  }
  if ("eval" in step) {
    return `
      const __t = performance.now();
      try {
        const __v = await (async () => { return (${step.eval}); })();
        stepResults[${index}] = __v;
        marks.push({ i: ${index}, kind: 'eval', ok: true, ms: Math.round(performance.now() - __t) });
      } catch (e) {
        marks.push({ i: ${index}, kind: 'eval', ok: false, ms: Math.round(performance.now() - __t), error: 'JS_ERROR', detail: String(e?.message ?? e) });
        return { failed: ${index} };
      }
    `;
  }
  if ("sleep" in step) {
    return `
      const __t = performance.now();
      await new Promise((r) => setTimeout(r, ${step.sleep}));
      marks.push({ i: ${index}, kind: 'sleep', ok: true, ms: Math.round(performance.now() - __t) });
    `;
  }
  if ("getUrl" in step) {
    return `
      const __t = performance.now();
      const __u = location.href;
      stepResults[${index}] = __u;
      marks.push({ i: ${index}, kind: 'get_url', ok: true, ms: Math.round(performance.now() - __t), url: __u });
    `;
  }
  if ("waitFor" in step) {
    const timeoutMs = step.timeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    return compileWaitFor(step.waitFor, timeoutMs, index);
  }
  if ("inspect" in step) {
    return compileInspect(step.inspect, index);
  }
  return `marks.push({ i: ${index}, kind: 'unknown', ok: false, error: 'INVALID_STEP' }); return { failed: ${index} };`;
}

function compileInspect(
  spec: Record<string, InspectTargetSpec>,
  index: number,
): string {
  const targetFragments = Object.entries(spec).map(([key, target]) => {
    const sel = JSON.stringify(target.selector);
    const styleProps = target.style ? JSON.stringify(target.style) : "null";
    const attrNames = target.attr ? JSON.stringify(target.attr) : "null";
    const rectKeys = Array.isArray(target.rect)
      ? JSON.stringify(target.rect)
      : target.rect
        ? JSON.stringify(["x", "y", "width", "height"])
        : "null";
    const wantText = target.text ? "true" : "false";
    const wantClass = target.classList ? "true" : "false";
    return `(() => {
      const el = document.querySelector(${sel});
      if (!el) { values[${JSON.stringify(key)}] = { __error: 'SELECTOR_NOT_FOUND', selector: ${sel} }; return; }
      const out = {};
      const styleProps = ${styleProps};
      if (styleProps) {
        const cs = getComputedStyle(el);
        for (const p of styleProps) out[p] = cs[p];
      }
      if (${wantText}) out.text = (el.textContent || '').trim();
      if (${wantClass}) out.classList = [...el.classList];
      const rectKeys = ${rectKeys};
      if (rectKeys) {
        const r = el.getBoundingClientRect();
        for (const k of rectKeys) out[k] = Math.round(r[k] * 100) / 100;
      }
      const attrNames = ${attrNames};
      if (attrNames) {
        for (const a of attrNames) out[a] = el.getAttribute(a);
      }
      values[${JSON.stringify(key)}] = out;
    })();`;
  });
  return `
    const __t = performance.now();
    const values = {};
    ${targetFragments.join("\n")}
    stepResults[${index}] = values;
    marks.push({ i: ${index}, kind: 'inspect', ok: true, ms: Math.round(performance.now() - __t) });
  `;
}

function compileWaitFor(
  cond: WaitCond,
  timeoutMs: number,
  index: number,
): string {
  let test: string;
  if ("selector" in cond) {
    test = `(() => { const el = document.querySelector(${escJson(cond.selector)}); return !!(el && (${VISIBLE_FILTER_JS})(el)); })()`;
  } else if ("gone" in cond) {
    test = `(() => { const el = document.querySelector(${escJson(cond.gone)}); return !el || !(${VISIBLE_FILTER_JS})(el); })()`;
  } else if ("role" in cond) {
    const sel = `[role=${JSON.stringify(cond.role)}]`;
    test = `(() => { const el = document.querySelector(${escJson(sel)}); return !!(el && (${VISIBLE_FILTER_JS})(el)); })()`;
  } else if ("text" in cond) {
    const within = cond.within
      ? `document.querySelector(${escJson(cond.within)}) ?? document.body`
      : "document.body";
    test = `(() => {
      const root = ${within};
      if (!root) return false;
      const isVis = ${VISIBLE_FILTER_JS};
      return [...root.querySelectorAll('*')].some((el) => isVis(el) && (el.textContent || '').includes(${escJson(cond.text)}));
    })()`;
  } else {
    // URL — prefix/glob-style match. ** wildcards supported.
    const pattern = cond.url;
    test = `(() => {
      const p = ${escJson(pattern)};
      const url = location.href;
      if (p.includes('*')) {
        const re = p.replace(/[.+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*\\*/g, '::D::').replace(/\\*/g, '[^/]*').replace(/::D::/g, '.*');
        return new RegExp('^' + re + '$').test(url);
      }
      return url.includes(p);
    })()`;
  }
  return `
    const __t = performance.now();
    const __end = __t + ${timeoutMs};
    let __ok = false;
    while (performance.now() < __end) {
      try { if (${test}) { __ok = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 100));
    }
    marks.push({ i: ${index}, kind: 'waitFor', ok: __ok, ms: Math.round(performance.now() - __t) });
    if (!__ok) {
      marks[marks.length - 1].error = 'WAIT_TIMEOUT';
      marks[marks.length - 1].cond = ${escJson(cond)};
      return { failed: ${index} };
    }
  `;
}

const SNAPSHOT_JS = `(() => {
  const isVis = ${VISIBLE_FILTER_JS};
  const dlg = document.querySelector('[role=dialog]');
  return {
    url: location.href,
    dialogPresent: !!dlg,
    visibleButtons: [...document.querySelectorAll('button, a, [role=button]')]
      .filter(isVis)
      .slice(0, 10)
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean),
    headings: [...document.querySelectorAll('h1, h2, h3')]
      .filter(isVis)
      .slice(0, 5)
      .map((h) => (h.textContent || '').trim()),
  };
})()`;

export interface CompileFlowOptions {
  /** stepsCode의 step 인덱스를 startIndex 만큼 오프셋해서 컴파일 (batch 내 chunk 단위 오프셋). */
  startIndex?: number;
}

export function compileFlow(
  input: FlowInput,
  options: CompileFlowOptions = {},
): string {
  const bail = input.bail ?? "on-error";
  const startIndex = options.startIndex ?? 0;
  const stepsCode = input.steps
    .map(
      (step, i) =>
        `await (async () => { ${compileStep(step, i + startIndex)} })().then((r) => {
          if (r && r.failed !== undefined) failed = r.failed;
        });
${bail === "on-error" ? `if (failed !== null) return;` : ""}`,
    )
    .join("\n");

  return `(async () => {
    const __t0 = performance.now();
    const marks = [];
    const stepResults = {};
    let failed = null;
    await (async () => {
      ${stepsCode}
    })();
    const result = { marks, totalMs: Math.round(performance.now() - __t0) };
    if (Object.keys(stepResults).length > 0) result.stepResults = stepResults;
    if (failed !== null) {
      result.failedAt = failed;
      result.snapshot = ${SNAPSHOT_JS};
    }
    return result;
  })()`;
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import type {
  CheckResult,
  FigmaSpec,
  FigmaTarget,
} from "../types.js";
import { normalizeExpected } from "./normalize.js";
import {
  installTransitionGuard,
  removeTransitionGuard,
} from "./transitionGuard.js";
import { applyState, resetState } from "./state.js";
import { checkCoverage, isIgnoredProp } from "./coverage.js";

interface ExpectedEntry {
  prop: string;
  value: string;
}

export function loadSpec(spec: FigmaSpec | string): FigmaSpec {
  if (typeof spec !== "string") return spec;
  const path = resolve(spec);
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as FigmaSpec;
}

export async function runFigmaSpec(
  page: Page,
  spec: FigmaSpec,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  results.push(...checkCoverage(spec));
  if (spec.cssVariables && spec.cssVariables.length > 0) {
    const declared = await readRootCssVariables(page, spec.cssVariables);
    for (const v of spec.cssVariables) {
      const value = declared[v] ?? "";
      const ok = value.trim() !== "";
      results.push({
        type: "figma_spec",
        ok,
        message: ok
          ? undefined
          : `[token-declared] "${v}" is not declared on :root (sniffed getComputedStyle returned empty). Add it to your theme/CSS or remove it from spec.cssVariables.`,
        observed: ok ? undefined : { cssVariable: v, declaredValue: value },
      });
    }
  }
  await installTransitionGuard(page);
  try {
    for (const target of spec.targets) {
      const sub = await runTarget(page, target);
      results.push(...sub);
    }
  } finally {
    await removeTransitionGuard(page);
  }
  return results;
}

async function readRootCssVariables(
  page: Page,
  names: string[],
): Promise<Record<string, string>> {
  return page.evaluate((ns) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of ns) {
      const key = n.startsWith("--") ? n : `--${n}`;
      out[n] = cs.getPropertyValue(key).trim();
    }
    return out;
  }, names);
}

async function runTarget(
  page: Page,
  target: FigmaTarget,
): Promise<CheckResult[]> {
  const state = target.state ?? "rest";
  const expected = flattenExpected(target);
  const tokens = target.tokens ?? [];
  if (expected.length === 0 && tokens.length === 0) return [];

  try {
    await applyState(page, target.selector, state);
  } catch (e) {
    return [
      {
        type: "figma_spec",
        ok: false,
        message: `[${state}] failed to apply state on "${target.selector}": ${errMsg(e)}`,
      },
    ];
  }

  let measured: {
    found: boolean;
    values: Record<string, string>;
    classList: string[];
  };
  try {
    measured = await measure(
      page,
      target.selector,
      expected.map((e) => e.prop),
      tokens.length > 0,
    );
  } finally {
    try {
      await resetState(page, state);
    } catch {
      // best-effort
    }
  }

  if (!measured.found) {
    return [
      {
        type: "figma_spec",
        ok: false,
        message: `[${state}] selector "${target.selector}" not found`,
      },
    ];
  }

  const out: CheckResult[] = [];

  for (const token of tokens) {
    const ok = measured.classList.includes(token);
    out.push({
      type: "figma_spec",
      ok,
      message: ok
        ? undefined
        : `[token-usage] ${target.selector} missing token class "${token}". Element rendered the right value but the design token was not used — likely a raw/arbitrary value.`,
      observed: ok
        ? undefined
        : {
            selector: target.selector,
            expectedToken: token,
            classList: measured.classList,
          },
    });
  }

  for (const e of expected) {
    const got = measured.values[e.prop] ?? "";
    const exp = normalizeExpected(e.prop, e.value);
    const ok = got === exp;
    out.push({
      type: "figma_spec",
      ok,
      message: ok
        ? undefined
        : `[${state}] ${target.selector} ${e.prop}: expected "${exp}" got "${got}"`,
      observed: ok
        ? undefined
        : {
            selector: target.selector,
            state,
            prop: e.prop,
            expected: exp,
            got,
          },
    });
  }
  return out;
}

function flattenExpected(target: FigmaTarget): ExpectedEntry[] {
  const out: ExpectedEntry[] = [];
  const t = target.typography ?? {};
  if (t.fontSize) out.push({ prop: "fontSize", value: t.fontSize });
  if (t.fontWeight) out.push({ prop: "fontWeight", value: t.fontWeight });
  if (t.lineHeight) out.push({ prop: "lineHeight", value: t.lineHeight });
  if (t.letterSpacing)
    out.push({ prop: "letterSpacing", value: t.letterSpacing });
  if (t.fontFamily) out.push({ prop: "fontFamily", value: t.fontFamily });
  for (const [prop, value] of Object.entries(target.style ?? {})) {
    if (isIgnoredProp(prop)) continue;
    out.push({ prop, value });
  }
  return out;
}

async function measure(
  page: Page,
  selector: string,
  props: string[],
  includeClassList: boolean,
): Promise<{ found: boolean; values: Record<string, string>; classList: string[] }> {
  return page.evaluate(
    ({ sel, ps, withClasses }) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, values: {}, classList: [] };
      const cs = getComputedStyle(el);
      const csAny = cs as unknown as Record<string, string>;
      const values: Record<string, string> = {};
      for (const p of ps) {
        let v = csAny[p];
        if (v === undefined || v === "") {
          const kebab = p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
          v = cs.getPropertyValue(kebab).trim();
        }
        values[p] = v ?? "";
      }
      const classList = withClasses ? Array.from(el.classList) : [];
      return { found: true, values, classList };
    },
    { sel: selector, ps: props, withClasses: includeClassList },
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

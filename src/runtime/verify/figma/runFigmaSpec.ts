import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import type {
  CheckResult,
  FigmaSpec,
  FigmaTarget,
} from "../types.js";
import { normalizeExpected } from "./normalize.js";
import { valuesMatch } from "./compare.js";
import { partitionTokens } from "./tokens.js";
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
  const { classNames, swatches } = partitionTokens(target.tokens);
  if (expected.length === 0 && classNames.length === 0) return [];

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
  const measureProps = [
    ...new Set([...expected.map((e) => e.prop), ...swatches.map((s) => s.prop)]),
  ];
  try {
    measured = await measure(
      page,
      target.selector,
      measureProps,
      classNames.length > 0,
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

  for (const token of classNames) {
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

  if (swatches.length > 0) {
    const swatchValues = await measureSwatches(page, target.selector, swatches);
    swatches.forEach((s, i) => {
      const elementValue = measured.values[s.prop] ?? "";
      const sw = swatchValues[i];
      const ok = valuesMatch(s.prop, sw.value, elementValue);
      const unresolvedHint =
        sw.value === sw.defaultValue
          ? ` (token class may not resolve in this project — swatch computed equals unstyled default)`
          : "";
      out.push({
        type: "figma_spec",
        ok,
        message: ok
          ? undefined
          : `[token-swatch] ${target.selector} ${s.prop}: token "${s.class}" paints "${sw.value}" but element shows "${elementValue}"${unresolvedHint}`,
        observed: ok
          ? undefined
          : {
              selector: target.selector,
              token: s.class,
              prop: s.prop,
              tokenPaints: sw.value,
              elementShows: elementValue,
            },
      });
    });
  }

  for (const e of expected) {
    const got = measured.values[e.prop] ?? "";
    const exp = normalizeExpected(e.prop, e.value);
    const ok = valuesMatch(e.prop, e.value, got);
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

// Paints each token class on a throwaway sibling of the target ("reference
// swatch") and reads the computed prop — the value the token *should* paint,
// resolved through the same cascade scope (theme container, dark mode, etc.).
// A control span without the class captures the unstyled default, used to
// hint when the token class did not resolve at all.
async function measureSwatches(
  page: Page,
  selector: string,
  swatches: Array<{ class: string; prop: string }>,
): Promise<Array<{ value: string; defaultValue: string }>> {
  // NOTE: no inner function declarations inside evaluate — tsx/esbuild
  // keepNames injects a __name helper that does not exist in the page.
  return page.evaluate(
    ({ sel, sw }) => {
      const el = document.querySelector(sel);
      const parent = el?.parentElement ?? document.body;
      return sw.map(({ cls, prop }) => {
        const control = document.createElement("span");
        const swatch = document.createElement("span");
        swatch.className = cls;
        for (const n of [control, swatch]) {
          n.style.position = "absolute";
          n.style.visibility = "hidden";
          n.style.pointerEvents = "none";
          parent.appendChild(n);
        }
        const kebab = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        const vals: string[] = [];
        for (const node of [swatch, control]) {
          const cs = getComputedStyle(node);
          const csAny = cs as unknown as Record<string, string>;
          let v = csAny[prop];
          if (v === undefined || v === "") {
            v = cs.getPropertyValue(kebab).trim();
          }
          vals.push(v ?? "");
        }
        control.remove();
        swatch.remove();
        return { value: vals[0], defaultValue: vals[1] };
      });
    },
    { sel: selector, sw: swatches.map((s) => ({ cls: s.class, prop: s.prop })) },
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

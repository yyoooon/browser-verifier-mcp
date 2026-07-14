import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCoverage } from "./coverage.js";
import { VISUAL_PROPERTY_SET } from "./visual-properties.js";
import type { FigmaSpec, FigmaTarget } from "../types.js";

function spec(partial: Partial<FigmaSpec> & { targets: FigmaTarget[] }): FigmaSpec {
  return {
    states: [],
    figmaVariants: [],
    ...partial,
  } as FigmaSpec;
}

// style object that pins every visual property (dummy values) → fully complete.
function completeStyle(): Record<string, string> {
  const s: Record<string, string> = {};
  for (const p of VISUAL_PROPERTY_SET) s[p] = "x";
  return s;
}

// --- non-strict (default) — spec-global category warning ---

test("non-strict: missing whole category → non-fatal warning", () => {
  const results = checkCoverage(
    spec({ targets: [{ selector: ".a", style: { fontSize: "16px" } }] }),
  );
  // typography present (fontSize), color/border/spacing missing → 3 warnings
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.ok === true)); // warning, not failure
  assert.ok(results.every((r) => r.message?.includes("[spec-coverage]")));
});

test("non-strict: all 4 nudged categories present → no coverage results", () => {
  const results = checkCoverage(
    spec({
      targets: [
        {
          selector: ".a",
          style: {
            color: "rgb(0,0,0)",
            borderTopWidth: "1px",
            fontSize: "16px",
            paddingTop: "8px",
          },
        },
      ],
    }),
  );
  assert.equal(results.length, 0);
});

// --- strict — per-target completeness (the "omit → fail" engine) ---

test("strict: target missing props → failure listing them", () => {
  const results = checkCoverage(
    spec({
      strict: true,
      targets: [{ selector: ".a", style: { color: "rgb(0,0,0)" } }],
    }),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.ok(results[0].message?.includes("[spec-completeness]"));
  // backgroundColor is unspecced → must be reported
  const missing = (results[0].observed as { missing: string[] }).missing;
  assert.ok(missing.includes("backgroundColor"));
  assert.ok(!missing.includes("color")); // color was specced
});

test("strict: fully-specced target → no completeness failure", () => {
  const results = checkCoverage(
    spec({ strict: true, targets: [{ selector: ".a", style: completeStyle() }] }),
  );
  assert.equal(results.length, 0);
});

test("strict: skipCategories excuses that group's props", () => {
  // spec everything except the spacing group, then skip spacing → should pass
  const style = completeStyle();
  for (const p of [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "columnGap",
    "rowGap",
  ]) {
    delete style[p];
  }
  const results = checkCoverage(
    spec({
      strict: true,
      skipCategories: ["spacing"],
      targets: [{ selector: ".a", style }],
    }),
  );
  assert.equal(results.length, 0);
});

test("strict: object token binding covers its prop", () => {
  const style = completeStyle();
  delete style.backgroundColor;
  const results = checkCoverage(
    spec({
      strict: true,
      targets: [
        {
          selector: ".a",
          style,
          tokens: [{ class: "bg-primary", prop: "backgroundColor" }],
        },
      ],
    }),
  );
  // backgroundColor now covered via swatch token → complete
  assert.equal(results.length, 0);
});

test("strict: string token does NOT cover a prop", () => {
  const style = completeStyle();
  delete style.backgroundColor;
  const results = checkCoverage(
    spec({
      strict: true,
      targets: [{ selector: ".a", style, tokens: ["bg-primary"] }],
    }),
  );
  assert.equal(results.length, 1);
  const missing = (results[0].observed as { missing: string[] }).missing;
  assert.ok(missing.includes("backgroundColor"));
});

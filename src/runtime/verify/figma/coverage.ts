import type {
  CheckResult,
  FigmaCategory,
  FigmaSpec,
  FigmaTarget,
} from "../types.js";
import { VISUAL_PROPERTY_SET } from "./visual-properties.js";

// Each VISUAL_PROPERTY_SET prop belongs to exactly one category, so
// skipCategories can excuse a whole group and the completeness math stays clean.
const CATEGORY_PROPS: Record<FigmaCategory, string[]> = {
  color: [
    "color",
    "backgroundColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
  ],
  border: [
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
    "outlineWidth",
    "outlineStyle",
    "outlineOffset",
  ],
  typography: [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "textDecorationLine",
    "textAlign",
  ],
  spacing: [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "columnGap",
    "rowGap",
  ],
  effect: ["boxShadow", "opacity"],
  layout: ["height", "minHeight", "display", "alignItems", "justifyContent"],
};

// Categories nudged (non-strict) / not auto-required beyond these. effect+layout
// are only enforced under strict completeness — as category warnings they'd be
// noisy for text/icon targets that legitimately have neither.
const WARN_CATEGORIES: FigmaCategory[] = [
  "color",
  "border",
  "typography",
  "spacing",
];

const IGNORED_PROPS = new Set([
  "transition",
  "transitionDuration",
  "transitionDelay",
  "transitionProperty",
  "transitionTimingFunction",
  "animation",
  "animationDuration",
  "animationDelay",
  "animationName",
  "cursor",
  "boxSizing",
]);

export function isIgnoredProp(prop: string): boolean {
  return IGNORED_PROPS.has(prop);
}

/** Props a target actually pins: typography keys + style keys + swatch-token props. */
function speccedProps(target: FigmaTarget): Set<string> {
  const s = new Set<string>();
  if (target.typography) {
    for (const k of Object.keys(target.typography)) s.add(k);
  }
  if (target.style) {
    for (const k of Object.keys(target.style)) if (!isIgnoredProp(k)) s.add(k);
  }
  for (const t of target.tokens ?? []) {
    // Object token { class, prop } is verified via reference swatch → covers prop.
    // String token is a classList-presence check only → does not cover a prop.
    if (typeof t !== "string") s.add(t.prop);
  }
  return s;
}

function skippedProps(skip: Set<FigmaCategory>): Set<string> {
  const out = new Set<string>();
  for (const cat of skip) for (const p of CATEGORY_PROPS[cat]) out.add(p);
  return out;
}

export function checkCoverage(spec: FigmaSpec): CheckResult[] {
  const skip = new Set(spec.skipCategories ?? []);
  return spec.strict === true
    ? completenessCheck(spec, skip)
    : categoryWarning(spec, skip);
}

// strict — every target must pin every VISUAL_PROPERTY_SET prop (minus skipped
// categories). Missing props FAIL, listing exactly what to extract from Figma.
function completenessCheck(
  spec: FigmaSpec,
  skip: Set<FigmaCategory>,
): CheckResult[] {
  const skipped = skippedProps(skip);
  const required = VISUAL_PROPERTY_SET.filter((p) => !skipped.has(p));
  const out: CheckResult[] = [];
  for (const target of spec.targets) {
    const specced = speccedProps(target);
    const missing = required.filter((p) => !specced.has(p));
    if (missing.length === 0) continue;
    out.push({
      type: "figma_spec",
      ok: false,
      message: `[spec-completeness] "${target.selector}" — ${missing.length} visual prop(s) unspecced: [${missing.join(", ")}]. Extract them from Figma (list even unchanged ones, e.g. boxShadow:"none") or silence a whole group via spec.skipCategories.`,
      observed: { selector: target.selector, missing },
    });
  }
  return out;
}

// non-strict (default) — spec-global heuristic: warn if a whole nudged category
// has no prop anywhere in the spec. Non-fatal (ok:true).
function categoryWarning(
  spec: FigmaSpec,
  skip: Set<FigmaCategory>,
): CheckResult[] {
  const present = categoriesPresent(collectSpecProps(spec));
  const missing = WARN_CATEGORIES.filter(
    (c) => !skip.has(c) && !present.has(c),
  );
  return missing.map((cat) => ({
    type: "figma_spec" as const,
    ok: true,
    message: `[spec-coverage] warning: missing required category "${cat}" — no prop from [${CATEGORY_PROPS[cat].slice(0, 5).join(", ")}${CATEGORY_PROPS[cat].length > 5 ? ", ..." : ""}]. Add a prop, set spec.strict for per-target enforcement, or list in spec.skipCategories to silence.`,
    observed: { category: cat, candidates: CATEGORY_PROPS[cat] },
  }));
}

function collectSpecProps(spec: FigmaSpec): Set<string> {
  const props = new Set<string>();
  for (const target of spec.targets) {
    for (const p of speccedProps(target)) props.add(p);
  }
  return props;
}

function categoriesPresent(props: Set<string>): Set<FigmaCategory> {
  const found = new Set<FigmaCategory>();
  for (const [cat, list] of Object.entries(CATEGORY_PROPS) as [
    FigmaCategory,
    string[],
  ][]) {
    if (list.some((p) => props.has(p))) found.add(cat);
  }
  return found;
}

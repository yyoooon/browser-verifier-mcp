import type {
  CheckResult,
  FigmaCategory,
  FigmaSpec,
  FigmaTarget,
} from "../types.js";

const COLOR_PROPS = [
  "backgroundColor",
  "color",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
];

const BORDER_PROPS = [
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
];

const TYPOGRAPHY_PROPS = ["fontSize", "fontWeight", "lineHeight"];

const SPACING_PROPS = [
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
];

const CATEGORY_PROPS: Record<FigmaCategory, string[]> = {
  color: COLOR_PROPS,
  border: BORDER_PROPS,
  typography: TYPOGRAPHY_PROPS,
  spacing: SPACING_PROPS,
};

const REQUIRED_CATEGORIES: FigmaCategory[] = [
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

function collectSpecProps(spec: FigmaSpec): Set<string> {
  const props = new Set<string>();
  for (const target of spec.targets) {
    if (target.typography) {
      for (const k of Object.keys(target.typography)) props.add(k);
    }
    if (target.style) {
      for (const k of Object.keys(target.style)) props.add(k);
    }
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

export function checkCoverage(spec: FigmaSpec): CheckResult[] {
  const skip = new Set(spec.skipCategories ?? []);
  const required = REQUIRED_CATEGORIES.filter((c) => !skip.has(c));
  const present = categoriesPresent(collectSpecProps(spec));
  const missing = required.filter((c) => !present.has(c));
  if (missing.length === 0) return [];
  const strict = spec.strict === true;
  return missing.map((cat) => ({
    type: "figma_spec" as const,
    ok: !strict,
    message: `[spec-coverage] ${strict ? "missing" : "warning: missing"} required category "${cat}" — no prop from [${CATEGORY_PROPS[cat].slice(0, 5).join(", ")}${CATEGORY_PROPS[cat].length > 5 ? ", ..." : ""}]. ${strict ? "Set spec.strict=false or add a prop." : "Add a prop or list in spec.skipCategories to silence."}`,
    observed: { category: cat, candidates: CATEGORY_PROPS[cat] },
  }));
}

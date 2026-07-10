import { normalizeExpected } from "./normalize.js";

// Sub-pixel snapping from zoom / DPR makes computed px drift below 0.5px.
const PX_TOLERANCE = 0.5;
const PX_RE = /^-?\d*\.?\d+px$/;
const COLOR_FN_RE = /^(rgb|rgba|hsl|hsla|oklch)\(/;

export function valuesMatch(
  prop: string,
  expected: string,
  observed: string,
): boolean {
  const exp = normalizeExpected(prop, expected);
  const got = observed.trim();

  if (exp === got) return true;

  if (PX_RE.test(exp) && PX_RE.test(got)) {
    return Math.abs(parseFloat(exp) - parseFloat(got)) <= PX_TOLERANCE;
  }

  if (COLOR_FN_RE.test(exp) && COLOR_FN_RE.test(got)) {
    return exp.replace(/\s+/g, "") === got.replace(/\s+/g, "");
  }

  if (prop === "fontFamily") {
    return normalizeFontFamily(exp) === normalizeFontFamily(got);
  }

  return false;
}

// Browsers serialize font-family differently: quoting, comma spacing, and
// macOS aliasing of BlinkMacSystemFont vs system-ui.
function normalizeFontFamily(value: string): string {
  return value
    .toLowerCase()
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .map((f) => (f === "blinkmacsystemfont" ? "system-ui" : f))
    .join(",");
}

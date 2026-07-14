// Every computed property that affects appearance. A figma_spec target is
// "complete" only when it gives an expected value (or a token) for all of
// these — the anti-omission backbone ported from huray-design-web.
// Longhand only: shorthands (border, padding, ...) serialize inconsistently
// across browsers, so comparison is unstable.
export const VISUAL_PROPERTY_SET = [
  // color
  "color",
  "backgroundColor",
  // border color / width / style (4 sides)
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  // radius (4 corners)
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  // effect
  "boxShadow",
  "opacity",
  // focus ring
  "outlineColor",
  "outlineWidth",
  "outlineStyle",
  "outlineOffset",
  // typography
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textDecorationLine",
  "textAlign",
  // box / layout
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "columnGap",
  "rowGap",
  "height",
  "minHeight",
  "display",
  "alignItems",
  "justifyContent",
] as const;

export type TVisualProperty = (typeof VISUAL_PROPERTY_SET)[number];

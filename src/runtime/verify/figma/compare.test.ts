import { test } from "node:test";
import assert from "node:assert/strict";
import { valuesMatch } from "./compare.js";

// --- baseline: exact match ---

test("exact string match passes", () => {
  assert.equal(valuesMatch("fontWeight", "500", "500"), true);
});

test("plain mismatch fails", () => {
  assert.equal(valuesMatch("fontWeight", "500", "600"), false);
});

test("surrounding whitespace is trimmed", () => {
  assert.equal(valuesMatch("display", " flex ", "flex"), true);
});

// --- px tolerance (±0.5px, sub-pixel snapping from zoom/DPR) ---

test("px within 0.5 tolerance passes (above)", () => {
  assert.equal(valuesMatch("borderTopWidth", "16px", "16.5px"), true);
});

test("px within 0.5 tolerance passes (below)", () => {
  assert.equal(valuesMatch("paddingTop", "16px", "15.5px"), true);
});

test("px beyond 0.5 tolerance fails", () => {
  assert.equal(valuesMatch("paddingTop", "16px", "16.51px"), false);
});

test("negative px values compare with tolerance", () => {
  assert.equal(valuesMatch("letterSpacing", "-0.5px", "-0.48px"), true);
});

test("px vs non-px does not silently pass", () => {
  assert.equal(valuesMatch("lineHeight", "24px", "normal"), false);
});

test("non-px numbers get no tolerance", () => {
  assert.equal(valuesMatch("fontWeight", "500", "501"), false);
});

// --- color normalization ---

test("rgb whitespace differences pass", () => {
  assert.equal(
    valuesMatch("backgroundColor", "rgb(0, 0, 0)", "rgb(0,0,0)"),
    true,
  );
});

test("rgba whitespace differences pass", () => {
  assert.equal(
    valuesMatch("color", "rgba(0, 0, 0, 0.5)", "rgba(0,0,0,0.5)"),
    true,
  );
});

test("different rgb values still fail", () => {
  assert.equal(
    valuesMatch("backgroundColor", "rgb(0, 0, 0)", "rgb(0, 0, 1)"),
    false,
  );
});

test("hex expected is normalized to rgb before compare", () => {
  assert.equal(
    valuesMatch("backgroundColor", "#d6eafa", "rgb(214, 234, 250)"),
    true,
  );
});

test("8-digit hex expected matches rgba observed", () => {
  assert.equal(
    valuesMatch("backgroundColor", "#00000080", "rgba(0, 0, 0, 0.5)"),
    true,
  );
});

// --- fontFamily normalization (only for fontFamily prop) ---

test("fontFamily quotes are stripped", () => {
  assert.equal(
    valuesMatch("fontFamily", "Inter, sans-serif", '"Inter", sans-serif'),
    true,
  );
});

test("fontFamily comma spacing is normalized", () => {
  assert.equal(
    valuesMatch("fontFamily", "Inter,sans-serif", "Inter, sans-serif"),
    true,
  );
});

test("fontFamily is case-insensitive", () => {
  assert.equal(valuesMatch("fontFamily", "Pretendard", "pretendard"), true);
});

test("BlinkMacSystemFont unifies to system-ui", () => {
  assert.equal(
    valuesMatch(
      "fontFamily",
      "-apple-system, BlinkMacSystemFont, sans-serif",
      "-apple-system, system-ui, sans-serif",
    ),
    true,
  );
});

test("different fontFamily still fails", () => {
  assert.equal(valuesMatch("fontFamily", "Inter", "Roboto"), false);
});

test("quote stripping does not apply to non-font props", () => {
  assert.equal(valuesMatch("content", '"a"', "a"), false);
});

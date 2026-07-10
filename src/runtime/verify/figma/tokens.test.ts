import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionTokens } from "./tokens.js";

test("undefined tokens yield empty partition", () => {
  assert.deepEqual(partitionTokens(undefined), {
    classNames: [],
    swatches: [],
  });
});

test("string tokens become classList checks only", () => {
  assert.deepEqual(partitionTokens(["bg-primary", "text-body-lg"]), {
    classNames: ["bg-primary", "text-body-lg"],
    swatches: [],
  });
});

test("object tokens produce both classList check and swatch check", () => {
  assert.deepEqual(
    partitionTokens([{ class: "bg-primary", prop: "backgroundColor" }]),
    {
      classNames: ["bg-primary"],
      swatches: [{ class: "bg-primary", prop: "backgroundColor" }],
    },
  );
});

test("mixed string and object tokens partition correctly", () => {
  assert.deepEqual(
    partitionTokens([
      "rounded-16",
      { class: "bg-primary", prop: "backgroundColor" },
    ]),
    {
      classNames: ["rounded-16", "bg-primary"],
      swatches: [{ class: "bg-primary", prop: "backgroundColor" }],
    },
  );
});

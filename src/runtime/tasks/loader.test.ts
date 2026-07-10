import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTasksFile } from "./loader.js";

function validate(steps: unknown[]) {
  return validateTasksFile({ t: { steps } });
}

test("wait_gone with selector is accepted", () => {
  const r = validate([{ op: "wait_gone", selector: "[role=dialog]" }]);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.tasks.t.steps.length, 1);
});

test("wait_gone without selector is rejected", () => {
  const r = validate([{ op: "wait_gone" }]);
  assert.match(r.warnings.join("\n"), /wait_gone.*selector/);
});

test("press_key with key is accepted", () => {
  const r = validate([{ op: "press_key", key: "Escape" }]);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.tasks.t.steps.length, 1);
});

test("press_key accepts optional selector", () => {
  const r = validate([
    { op: "press_key", key: "Enter", selector: "input[name=q]" },
  ]);
  assert.equal(r.warnings.length, 0);
});

test("press_key without key is rejected", () => {
  const r = validate([{ op: "press_key" }]);
  assert.match(r.warnings.join("\n"), /press_key.*key/);
});

test("select_option with selector and value is accepted", () => {
  const r = validate([
    { op: "select_option", selector: "select[name=city]", value: "seoul" },
  ]);
  assert.equal(r.warnings.length, 0);
});

test("select_option with selector and label is accepted", () => {
  const r = validate([
    { op: "select_option", selector: "select[name=city]", label: "서울" },
  ]);
  assert.equal(r.warnings.length, 0);
});

test("select_option without value or label is rejected", () => {
  const r = validate([{ op: "select_option", selector: "select" }]);
  assert.match(r.warnings.join("\n"), /select_option.*value/);
});

test("wait_url accepts 'url' alias like the runner does", () => {
  const r = validate([{ op: "wait_url", url: "**/dashboard" }]);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.tasks.t.steps.length, 1);
});

test("wait_url with neither pattern nor url is rejected", () => {
  const r = validate([{ op: "wait_url" }]);
  assert.match(r.warnings.join("\n"), /wait_url.*pattern/);
});

test("unknown op still warns", () => {
  const r = validate([{ op: "hover" }]);
  assert.match(r.warnings.join("\n"), /unknown op "hover"/);
});

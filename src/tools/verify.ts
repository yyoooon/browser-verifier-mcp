import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ensureAttached } from "../runtime/client.js";
import { runVerify } from "../runtime/verify/runVerify.js";
import type { VerifyCheck } from "../runtime/verify/types.js";
import { ok, fail } from "../lib/result.js";

export const definition: Tool = {
  name: "browser_verify",
  description:
    "Run a batch of generic, structured verifications against ONE semantic snapshot of the page (state checks) plus one batched DOM query (style/class checks). Returns { ok, checks: [...], state, elapsedMs }. ok is true iff every check passed. Prefer this over multiple browser_eval calls for assertion-style verification. Check types:\n" +
    "  State (read SemanticState):\n" +
    "  - { type: 'primary_cta', expectedText?, mustBeEnabled? } — primaryCTA exists; optionally text contains expectedText; optionally must be enabled.\n" +
    "  - { type: 'no_errors' } — no visible error alerts.\n" +
    "  - { type: 'loaded', timeoutMs? } — page not in loading state; polls up to timeoutMs ms if still loading.\n" +
    "  - { type: 'route', expected } — current location matches glob (e.g. '**/dashboard', '/users/*').\n" +
    "  - { type: 'modal_open', expectedTitle? } — a dialog is open; optionally title contains expectedTitle.\n" +
    "  - { type: 'modal_closed' } — no dialog open.\n" +
    "  - { type: 'heading_present', text } — at least one h1/h2 contains text.\n" +
    "  - { type: 'input_count', min?, max?, exact? } — visible input/textarea/select count constraint.\n" +
    "  DOM (one batched querySelector + getComputedStyle / classList):\n" +
    "  - { type: 'computed_style', selector, prop, expected } — getComputedStyle(el)[prop] === expected (exact string match).\n" +
    "    prop accepts camelCase (backgroundColor, paddingLeft) or kebab-case (background-color).\n" +
    "    expected MUST be the BROWSER-NORMALIZED form, not Figma raw: '#d6eafa' → 'rgb(214, 234, 250)', '1rem' → '16px', 'bold' → '700'.\n" +
    "    Tailwind v4 theme colors output oklch(); arbitrary values (bg-[#hex]) stay rgb(). If unsure, run browser_eval once to capture the actual computed value, then bake it into the check.\n" +
    "  - { type: 'class_present', selector, className } — el.classList.contains(className).\n" +
    "  - { type: 'class_absent', selector, className } — !el.classList.contains(className).\n" +
    "  For Figma → Tailwind verification patterns see skills/references/figma-tailwind-check.md.",
  inputSchema: {
    type: "object",
    properties: {
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "primary_cta",
                "no_errors",
                "loaded",
                "route",
                "modal_open",
                "modal_closed",
                "heading_present",
                "input_count",
                "computed_style",
                "class_present",
                "class_absent",
              ],
            },
          },
          required: ["type"],
          additionalProperties: true,
        },
      },
    },
    required: ["checks"],
  },
};

export async function handler(args: { checks: VerifyCheck[] }) {
  try {
    const state = await ensureAttached();
    const result = await runVerify(state.page, args.checks);
    return result.ok
      ? ok(result)
      : fail("one or more checks failed", {
          checks: result.checks,
          state: result.state,
          elapsedMs: result.elapsedMs,
        });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

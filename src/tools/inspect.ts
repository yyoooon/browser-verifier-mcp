import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ensureAttached } from "../runtime/client.js";
import { runInspect } from "../runtime/inspect/runInspect.js";
import type { InspectInput } from "../runtime/inspect/runInspect.js";
import { ok, fail } from "../lib/result.js";

export const definition: Tool = {
  name: "browser_inspect",
  description:
    "Read OBSERVED computed style / text / classList / rect / attributes for one or more selectors in ONE batched page.evaluate. Use when expected values are UNKNOWN — e.g. first-pass Figma comparison, exploring current state before writing assertions, capturing computed token values (oklch, normalized rgb) to bake into a later verify check. " +
    "For pass/fail assertions with known expected values, use browser_verify with computed_style / class_present / class_absent instead — that's the regression-guard role. inspect is the read-only complement (no expected, no pass/fail).\n" +
    "Input: { targets: { [key: string]: TargetSpec } }. Choose meaningful keys (e.g. 'title', 'ctaButton') — they appear unchanged in the output. TargetSpec:\n" +
    "  - selector (required): CSS selector\n" +
    "  - style: array of computed-style property names (camelCase or kebab-case) — e.g. ['fontSize', 'backgroundColor', 'padding']\n" +
    "  - text: true to include trimmed textContent\n" +
    "  - classList: true to include element.classList as array\n" +
    "  - rect: true for {x, y, width, height} (rounded to 2 decimals), or array like ['width', 'height'] for subset\n" +
    "  - attr: array of attribute names — e.g. ['data-state', 'aria-label']\n" +
    "Returns { ok: true, values, elapsedMs }. Values are in BROWSER-NORMALIZED form: '#d6eafa' shows as 'rgb(214, 234, 250)', '1rem' as '16px', 'bold' as '700', Tailwind v4 theme colors as 'oklch(...)'. Missing selectors return { __error: 'SELECTOR_NOT_FOUND', selector } for that key — other keys are unaffected.",
  inputSchema: {
    type: "object",
    properties: {
      targets: {
        type: "object",
        description:
          "Dict of named inspection targets. Keys are user-chosen labels that appear in the output unchanged.",
        additionalProperties: {
          type: "object",
          properties: {
            selector: { type: "string" },
            style: {
              type: "array",
              items: { type: "string" },
              description:
                "Computed-style property names (camelCase or kebab-case).",
            },
            text: { type: "boolean" },
            classList: { type: "boolean" },
            rect: {
              oneOf: [
                { type: "boolean" },
                { type: "array", items: { type: "string" } },
              ],
              description:
                "true → {x,y,width,height}. Array → subset (e.g. ['width','height']).",
            },
            attr: { type: "array", items: { type: "string" } },
          },
          required: ["selector"],
        },
      },
    },
    required: ["targets"],
  },
};

export async function handler(args: { targets: InspectInput }) {
  try {
    const state = await ensureAttached();
    const result = await runInspect(state.page, args.targets);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

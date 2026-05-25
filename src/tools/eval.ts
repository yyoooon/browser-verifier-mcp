import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { evalInBrowser } from "../cdp/eval.js";
import { ok, fail } from "../lib/result.js";

export const definition: Tool = {
  name: "browser_eval",
  description:
    "Run JavaScript in the attached browser target via CDP Runtime.evaluate (returnByValue, awaitPromise). Use for same-page DOM inspection, React state checks, or multi-step same-page interactions. Do NOT use to trigger page navigation (location.href / router.push / link clicks) — those invalidate the execution context mid-eval; use browser_batch with op:'navigate' or op:'click' followed by op:'wait_url' instead.",
  inputSchema: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description:
          "JavaScript expression or async IIFE. Return value is serialized.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional eval timeout (default 8000ms).",
      },
    },
    required: ["script"],
  },
};

export async function handler(args: { script: string; timeoutMs?: number }) {
  const r = await evalInBrowser(args.script, args.timeoutMs);
  if (!r.ok) return fail(r.error, { elapsedMs: r.elapsedMs });
  return ok({ ok: true, value: r.value, elapsedMs: r.elapsedMs });
}

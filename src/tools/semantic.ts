import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ensureAttached } from "../runtime/client.js";
import { extractSemanticState } from "../runtime/semantic/extractSemanticState.js";
import { ok, fail } from "../lib/result.js";

export const definition: Tool = {
  name: "browser_semantic_state",
  description:
    "Extract a compact, bounded snapshot of the current page state: route, title, loading hints, modal, primaryCTA, headings, errors, inputCount, focusedElement. Returns one JSON object — prefer this over multiple browser_eval calls for page-state reasoning. Generic across React apps; no app-specific selectors.",
  inputSchema: { type: "object", properties: {} },
};

export async function handler() {
  try {
    const state = await ensureAttached();
    const snapshot = await extractSemanticState(state.page);
    return ok(snapshot);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

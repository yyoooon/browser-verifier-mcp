import { listTargets } from "../cdp/target.js";
import { getCurrent } from "../cdp/client.js";
import { ok, fail } from "../lib/result.js";
export const listDefinition = {
    name: "browser_tab_list",
    description: "List all page targets in the attached Chrome (via CDP) with their URL, title, and id. Excludes devtools:// internal pages. Use to verify which worktree ports have open tabs without spawning agent-browser.",
    inputSchema: { type: "object", properties: {} },
};
export async function listHandler() {
    try {
        const current = getCurrent();
        const targets = await listTargets(current?.cdpUrl);
        const pages = targets
            .filter((t) => t.type === "page" && !t.url.startsWith("devtools://"))
            .map((t) => ({
            id: t.id,
            url: t.url,
            title: t.title,
            attached: current?.targetId === t.id,
        }));
        return ok({ ok: true, total: pages.length, tabs: pages });
    }
    catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
    }
}
//# sourceMappingURL=tabs.js.map
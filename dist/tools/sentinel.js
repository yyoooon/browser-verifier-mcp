import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ok, fail } from "../lib/result.js";
export const definition = {
    name: "browser_sentinel_save",
    description: 'Compute the current diff hash (tracked diff + untracked file contents, ephemeral files excluded) and write it to "<projectRoot>/.claude/.last-verified-hash". This stops the Stop-hook auto-verify loop after a PASS/SKIP. Call this once at the end of a successful verification cycle. projectRoot defaults to git rev-parse --show-toplevel.',
    inputSchema: {
        type: "object",
        properties: {
            projectRoot: {
                type: "string",
                description: "Absolute path to the git root. Defaults to current git toplevel.",
            },
        },
    },
};
const EPHEMERAL_PATTERN = String.raw `\.(log|pid)$|^\.env(\.|$)|^\.DS_Store`;
function sh(cmd, cwd) {
    return execSync(cmd, { encoding: "utf8", cwd }).toString();
}
export async function handler(args) {
    try {
        const root = args.projectRoot ?? sh("git rev-parse --show-toplevel").trim();
        const trackedDiff = sh("git diff HEAD", root);
        const untrackedList = sh("git ls-files --others --exclude-standard", root)
            .split("\n")
            .filter(Boolean)
            .filter((f) => !new RegExp(EPHEMERAL_PATTERN).test(f))
            .sort();
        let untrackedBody = "";
        for (const f of untrackedList) {
            try {
                const content = readFileSync(join(root, f), "utf8");
                untrackedBody += `===UNTRACKED: ${f}\n${content}`;
            }
            catch {
                // skip unreadable
            }
        }
        const hash = createHash("sha256")
            .update(trackedDiff + untrackedBody)
            .digest("hex");
        const dir = join(root, ".claude");
        mkdirSync(dir, { recursive: true });
        const sentinelPath = join(dir, ".last-verified-hash");
        writeFileSync(sentinelPath, hash);
        return ok({
            ok: true,
            hash,
            sentinelPath,
            untrackedCount: untrackedList.length,
        });
    }
    catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
    }
}
//# sourceMappingURL=sentinel.js.map
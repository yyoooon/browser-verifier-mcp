import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
const DEFAULT_RANGE = [
    3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009,
];
export function detectPort() {
    // 1. .env.local in process.cwd()
    try {
        const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
        const m = env.match(/^PORT\s*=\s*(\d+)/m);
        if (m)
            return parseInt(m[1], 10);
    }
    catch {
        // ignore
    }
    // 2. lsof — any node listener on the typical Next dev range
    try {
        const out = execSync("lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null", {
            encoding: "utf8",
        });
        for (const port of DEFAULT_RANGE) {
            if (new RegExp(`node\\s+\\d+.*:${port}\\s+\\(LISTEN\\)`).test(out))
                return port;
        }
    }
    catch {
        // ignore
    }
    // 3. fallback
    return 3000;
}
//# sourceMappingURL=port.js.map
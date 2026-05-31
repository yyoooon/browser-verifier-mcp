import http from "node:http";
import { CDP_BASE_URL } from "./config.js";
export async function listTargets(cdpUrl = CDP_BASE_URL) {
    return new Promise((resolve, reject) => {
        const req = http.get(`${cdpUrl}/json/list`, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(2000, () => req.destroy(new Error("CDP /json/list timeout")));
    });
}
export async function findTargetByPort(devPort, cdpUrl = CDP_BASE_URL) {
    const targets = await listTargets(cdpUrl);
    const re = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${devPort}(/|$)`);
    return (targets.find((t) => t.type === "page" && !t.url.startsWith("devtools://") && re.test(t.url)) ?? null);
}
//# sourceMappingURL=target.js.map
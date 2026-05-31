import http from "node:http";
import { CDP_BASE_URL } from "./config.js";

export interface CDPTarget {
  id: string;
  url: string;
  title: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export async function listTargets(
  cdpUrl: string = CDP_BASE_URL,
): Promise<CDPTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${cdpUrl}/json/list`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as CDPTarget[]);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () =>
      req.destroy(new Error("CDP /json/list timeout")),
    );
  });
}

export async function findTargetByPort(
  devPort: number,
  cdpUrl: string = CDP_BASE_URL,
): Promise<CDPTarget | null> {
  const targets = await listTargets(cdpUrl);
  const re = new RegExp(
    `^https?://(localhost|127\\.0\\.0\\.1):${devPort}(/|$)`,
  );
  return (
    targets.find(
      (t) =>
        t.type === "page" && !t.url.startsWith("devtools://") && re.test(t.url),
    ) ?? null
  );
}

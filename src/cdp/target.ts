import http from "node:http";

export interface CDPTarget {
  id: string;
  url: string;
  title: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export async function listTargets(cdpPort = 9223): Promise<CDPTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${cdpPort}/json/list`, (res) => {
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
  cdpPort = 9223,
): Promise<CDPTarget | null> {
  const targets = await listTargets(cdpPort);
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

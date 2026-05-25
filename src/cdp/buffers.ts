import type CDP from "chrome-remote-interface";

export interface ConsoleEntry {
  level: "log" | "info" | "warning" | "error" | "debug" | "trace";
  text: string;
  ts: number;
}

export interface NetworkEntry {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type?: string;
  failed?: boolean;
  failureText?: string;
  startedAt: number;
  endedAt?: number;
}

let consoleBuf: ConsoleEntry[] = [];
const networkMap = new Map<string, NetworkEntry>();
let attachedClient: CDP.Client | null = null;

export function attachBuffers(client: CDP.Client) {
  if (attachedClient === client) return;
  attachedClient = client;
  consoleBuf = [];
  networkMap.clear();

  client.Runtime.consoleAPICalled((p) => {
    const text = p.args
      .map((a) => {
        if (a.type === "string") return String(a.value);
        if (a.value !== undefined) {
          try {
            return typeof a.value === "string"
              ? a.value
              : JSON.stringify(a.value);
          } catch {
            return String(a.value);
          }
        }
        return a.description ?? "";
      })
      .join(" ");
    consoleBuf.push({
      level: p.type as ConsoleEntry["level"],
      text,
      ts: p.timestamp,
    });
  });

  client.Runtime.exceptionThrown((p) => {
    const ex = p.exceptionDetails;
    const msg =
      (ex.exception?.description as string | undefined) ??
      ex.text ??
      "exception";
    consoleBuf.push({ level: "error", text: msg, ts: p.timestamp });
  });

  client.Network.requestWillBeSent((p) => {
    networkMap.set(p.requestId, {
      requestId: p.requestId,
      url: p.request.url,
      method: p.request.method,
      type: p.type,
      startedAt: p.timestamp,
    });
  });

  client.Network.responseReceived((p) => {
    const e = networkMap.get(p.requestId);
    if (e) {
      e.status = p.response.status;
      e.statusText = p.response.statusText;
      e.endedAt = p.timestamp;
    }
  });

  client.Network.loadingFailed((p) => {
    const e = networkMap.get(p.requestId);
    if (e) {
      e.failed = true;
      e.failureText = p.errorText;
      e.endedAt = p.timestamp;
    }
  });
}

export function getConsole(): ConsoleEntry[] {
  return [...consoleBuf];
}

export function clearConsole() {
  consoleBuf = [];
}

export function getNetwork(): NetworkEntry[] {
  return [...networkMap.values()];
}

export function clearNetwork() {
  networkMap.clear();
}

export function detachBuffers() {
  attachedClient = null;
  consoleBuf = [];
  networkMap.clear();
}

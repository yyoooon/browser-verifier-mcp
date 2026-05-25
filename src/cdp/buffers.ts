import type {
  ConsoleMessage,
  Page,
  Request as PWRequest,
  Response as PWResponse,
} from "playwright";

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
const networkMap = new Map<PWRequest, NetworkEntry>();
let attachedPage: Page | null = null;
let nextRequestId = 1;

type Handler = (...args: unknown[]) => void;
let listeners: Array<{ event: string; fn: Handler }> = [];
let pendingSerializations: Promise<unknown>[] = [];

export function attachBuffers(page: Page) {
  if (attachedPage === page) return;
  if (attachedPage) detachBuffers();
  attachedPage = page;
  consoleBuf = [];
  networkMap.clear();
  nextRequestId = 1;

  const onConsole = (msg: ConsoleMessage) => {
    const ts = Date.now();
    const level = normalizeLevel(msg.type());
    const args = msg.args();
    if (args.length === 0) {
      consoleBuf.push({ level, text: msg.text(), ts });
      return;
    }
    const p = Promise.all(
      args.map(async (a) => {
        try {
          const v = await a.jsonValue();
          if (typeof v === "string") return v;
          return JSON.stringify(v);
        } catch {
          return String(a);
        }
      }),
    ).then(
      (parts) => {
        consoleBuf.push({ level, text: parts.join(" "), ts });
      },
      () => {
        consoleBuf.push({ level, text: msg.text(), ts });
      },
    );
    pendingSerializations.push(p);
  };
  page.on("console", onConsole);
  listeners.push({ event: "console", fn: onConsole as unknown as Handler });

  const onPageError = (err: Error) => {
    consoleBuf.push({
      level: "error",
      text: err.message,
      ts: Date.now(),
    });
  };
  page.on("pageerror", onPageError);
  listeners.push({ event: "pageerror", fn: onPageError as unknown as Handler });

  const onRequest = (req: PWRequest) => {
    networkMap.set(req, {
      requestId: `req-${nextRequestId++}`,
      url: req.url(),
      method: req.method(),
      type: req.resourceType(),
      startedAt: Date.now(),
    });
  };
  page.on("request", onRequest);
  listeners.push({ event: "request", fn: onRequest as unknown as Handler });

  const onResponse = (res: PWResponse) => {
    const req = res.request();
    const entry = networkMap.get(req);
    if (entry) {
      entry.status = res.status();
      entry.statusText = res.statusText();
      entry.endedAt = Date.now();
    }
  };
  page.on("response", onResponse);
  listeners.push({ event: "response", fn: onResponse as unknown as Handler });

  const onRequestFailed = (req: PWRequest) => {
    const entry = networkMap.get(req);
    if (entry) {
      entry.failed = true;
      entry.failureText = req.failure()?.errorText ?? "request failed";
      entry.endedAt = Date.now();
    }
  };
  page.on("requestfailed", onRequestFailed);
  listeners.push({
    event: "requestfailed",
    fn: onRequestFailed as unknown as Handler,
  });
}

export function getConsole(): ConsoleEntry[] {
  return [...consoleBuf];
}

export async function flushConsole(): Promise<void> {
  if (pendingSerializations.length === 0) return;
  const snapshot = pendingSerializations;
  pendingSerializations = [];
  await Promise.all(snapshot).catch(() => undefined);
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
  if (attachedPage) {
    for (const { event, fn } of listeners) {
      try {
        attachedPage.off(event as Parameters<Page["off"]>[0], fn);
      } catch {
        // ignore — page may already be closed
      }
    }
  }
  listeners = [];
  attachedPage = null;
  consoleBuf = [];
  networkMap.clear();
  pendingSerializations = [];
}

function normalizeLevel(type: string): ConsoleEntry["level"] {
  switch (type) {
    case "log":
    case "info":
    case "warning":
    case "error":
    case "debug":
    case "trace":
      return type;
    case "warn":
      return "warning";
    default:
      return "log";
  }
}

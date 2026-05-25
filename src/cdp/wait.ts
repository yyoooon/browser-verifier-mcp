import { ensureAttached } from "./client.js";
import { evalInBrowser } from "./eval.js";
import { globMatch } from "../lib/glob.js";

const POLL_MS = 100;
const DEFAULT_TIMEOUT_MS = 5000;

export interface WaitResult {
  ok: boolean;
  elapsedMs: number;
  finalValue?: unknown;
  error?: string;
}

export async function waitForUrl(
  pattern: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WaitResult> {
  return pollUntil(
    async () => {
      const r = await evalInBrowser("location.href", 1000);
      return r.ok ? (r.value as string) : null;
    },
    (url) => url !== null && globMatch(pattern, url),
    timeoutMs,
    `URL did not match ${pattern}`,
  );
}

export async function waitForText(
  text: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WaitResult> {
  return pollUntil(
    async () => {
      const r = await evalInBrowser(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
        1000,
      );
      return r.ok ? (r.value as boolean) : false;
    },
    (found) => found === true,
    timeoutMs,
    `text "${text}" did not appear`,
  );
}

export async function waitForSelector(
  selector: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WaitResult> {
  return pollUntil(
    async () => {
      const r = await evalInBrowser(
        `!!document.querySelector(${JSON.stringify(selector)})`,
        1000,
      );
      return r.ok ? (r.value as boolean) : false;
    },
    (found) => found === true,
    timeoutMs,
    `selector "${selector}" not found`,
  );
}

export async function waitForLoad(
  state: "load" | "domcontentloaded" | "networkidle" | "hydrated" = "load",
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WaitResult> {
  const t0 = Date.now();
  const cdp = await ensureAttached();

  if (state === "hydrated") {
    return pollUntil(
      async () => {
        const r = await evalInBrowser(
          `(() => {
            const root = document.body;
            if (!root) return false;
            const stack = [root];
            while (stack.length) {
              const el = stack.pop();
              for (const k of Object.keys(el)) {
                if (k.startsWith("__reactFiber") || k.startsWith("__reactProps")) return true;
              }
              if (el.children) {
                for (let i = 0; i < el.children.length && i < 50; i++) stack.push(el.children[i]);
              }
            }
            return false;
          })()`,
          500,
        );
        return r.ok ? (r.value as boolean) : false;
      },
      (found) => found === true,
      timeoutMs,
      "React did not hydrate",
    );
  }

  if (state === "load") {
    return pollUntil(
      async () => {
        const r = await evalInBrowser("document.readyState", 500);
        return r.ok ? (r.value as string) : null;
      },
      (s) => s === "complete",
      timeoutMs,
      "page did not finish loading",
    );
  }

  if (state === "domcontentloaded") {
    return pollUntil(
      async () => {
        const r = await evalInBrowser("document.readyState", 500);
        return r.ok ? (r.value as string) : null;
      },
      (s) => s === "interactive" || s === "complete",
      timeoutMs,
      "DOM did not load",
    );
  }

  // networkidle — no pending network for 500ms
  let lastActivity = Date.now();
  const unsub = cdp.client.Network.requestWillBeSent(() => {
    lastActivity = Date.now();
  });
  try {
    return await pollUntil(
      async () => Date.now() - lastActivity,
      (idle) => idle >= 500,
      timeoutMs,
      "network did not become idle",
    );
  } finally {
    unsub();
    void t0;
  }
}

async function pollUntil<T>(
  read: () => Promise<T>,
  pred: (v: T) => boolean,
  timeoutMs: number,
  failMsg: string,
): Promise<WaitResult> {
  const t0 = Date.now();
  let lastValue: T | undefined;
  while (Date.now() - t0 < timeoutMs) {
    lastValue = await read();
    if (pred(lastValue)) {
      return { ok: true, elapsedMs: Date.now() - t0, finalValue: lastValue };
    }
    await sleep(POLL_MS);
  }
  return {
    ok: false,
    elapsedMs: Date.now() - t0,
    finalValue: lastValue,
    error: failMsg,
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

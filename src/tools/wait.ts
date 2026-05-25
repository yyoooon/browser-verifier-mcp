import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  waitForUrl,
  waitForText,
  waitForSelector,
  waitForLoad,
} from "../cdp/wait.js";
import { ok, fail } from "../lib/result.js";

export const urlDefinition: Tool = {
  name: "browser_wait_url",
  description:
    "Poll location.href until it matches a glob pattern. Use after a navigation trigger (click/router.push). Default timeout 5000ms.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: 'Glob like "**/dashboard" or "**/tracker/energy".',
      },
      timeoutMs: { type: "number" },
    },
    required: ["pattern"],
  },
};

export const textDefinition: Tool = {
  name: "browser_wait_text",
  description: "Poll document.body.innerText until it contains the given text.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Substring to wait for." },
      timeoutMs: { type: "number" },
    },
    required: ["text"],
  },
};

export const selectorDefinition: Tool = {
  name: "browser_wait_selector",
  description:
    "Poll until document.querySelector(selector) returns an element.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string" },
      timeoutMs: { type: "number" },
    },
    required: ["selector"],
  },
};

export const loadDefinition: Tool = {
  name: "browser_wait_load",
  description:
    'Wait for page load state: "load" (readyState=complete), "domcontentloaded" (readyState=interactive+), "networkidle" (no requests 500ms), or "hydrated" (React fiber attached anywhere in DOM — most reliable for Next.js dev mode where networkidle never fires due to HMR).',
  inputSchema: {
    type: "object",
    properties: {
      state: {
        type: "string",
        enum: ["load", "domcontentloaded", "networkidle", "hydrated"],
      },
      timeoutMs: { type: "number" },
    },
  },
};

export async function waitUrlHandler(args: {
  pattern: string;
  timeoutMs?: number;
}) {
  const r = await waitForUrl(args.pattern, args.timeoutMs);
  return r.ok
    ? ok({ ok: true, url: r.finalValue, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "wait_url failed", {
        finalUrl: r.finalValue,
        elapsedMs: r.elapsedMs,
      });
}

export async function waitTextHandler(args: {
  text: string;
  timeoutMs?: number;
}) {
  const r = await waitForText(args.text, args.timeoutMs);
  return r.ok
    ? ok({ ok: true, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "wait_text failed", { elapsedMs: r.elapsedMs });
}

export async function waitSelectorHandler(args: {
  selector: string;
  timeoutMs?: number;
}) {
  const r = await waitForSelector(args.selector, args.timeoutMs);
  return r.ok
    ? ok({ ok: true, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "wait_selector failed", { elapsedMs: r.elapsedMs });
}

export async function waitLoadHandler(args: {
  state?: "load" | "domcontentloaded" | "networkidle" | "hydrated";
  timeoutMs?: number;
}) {
  const r = await waitForLoad(args.state, args.timeoutMs);
  return r.ok
    ? ok({ ok: true, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "wait_load failed", { elapsedMs: r.elapsedMs });
}

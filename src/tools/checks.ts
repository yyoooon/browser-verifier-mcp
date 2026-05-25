import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ensureAttached } from "../cdp/client.js";
import {
  getConsole,
  clearConsole,
  getNetwork,
  clearNetwork,
} from "../cdp/buffers.js";
import { evalInBrowser } from "../cdp/eval.js";
import { ok, fail } from "../lib/result.js";

const NOISE_PATTERNS = [
  /CareHubBridge/i,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  /webpack-internal/,
  /react-devtools/,
  /Download the React DevTools/,
  /Lighthouse/,
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(text));
}

export const consoleDefinition: Tool = {
  name: "browser_check_console",
  description:
    "Drain the in-server console buffer accumulated since attach (or last clear). Filters known dev-mode noise (CareHubBridge / HMR / Fast Refresh). Use after interactions to detect JS errors. Pass clear:true to flush after read.",
  inputSchema: {
    type: "object",
    properties: {
      level: {
        type: "string",
        enum: ["error", "warning", "log", "info", "debug", "all"],
        description:
          'Filter by level (default "all", "error" returns errors+exceptions).',
      },
      clear: { type: "boolean", description: "Clear buffer after read." },
      includeNoise: {
        type: "boolean",
        description: "Include filtered noise entries.",
      },
    },
  },
};

export const networkDefinition: Tool = {
  name: "browser_check_network",
  description:
    "Drain the in-server network buffer accumulated since attach. Returns failed (4xx/5xx/error) requests by default. Pass status to filter, clear:true to flush.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["all", "errors", "4xx", "5xx"],
        description: 'Default "errors" = 4xx + 5xx + transport failures.',
      },
      urlContains: {
        type: "string",
        description: "Filter URL substring (e.g. '/api/').",
      },
      clear: { type: "boolean" },
    },
  },
};

export const urlDefinition: Tool = {
  name: "browser_get_url",
  description: "Get the current location.href of the attached page.",
  inputSchema: { type: "object", properties: {} },
};

export const visibilityDefinition: Tool = {
  name: "browser_is_visible",
  description:
    "Check if a CSS selector matches an element that is in the DOM and has non-zero client rects (not display:none, not visibility:hidden).",
  inputSchema: {
    type: "object",
    properties: { selector: { type: "string" } },
    required: ["selector"],
  },
};

export async function consoleHandler(args: {
  level?: "error" | "warning" | "log" | "info" | "debug" | "all";
  clear?: boolean;
  includeNoise?: boolean;
}) {
  await ensureAttached();
  const all = getConsole();
  const filtered = all.filter((e) => {
    if (!args.includeNoise && isNoise(e.text)) return false;
    if (!args.level || args.level === "all") return true;
    if (args.level === "error") return e.level === "error";
    return e.level === args.level;
  });
  if (args.clear) clearConsole();
  return ok({
    ok: true,
    total: filtered.length,
    entries: filtered,
  });
}

export async function networkHandler(args: {
  status?: "all" | "errors" | "4xx" | "5xx";
  urlContains?: string;
  clear?: boolean;
}) {
  await ensureAttached();
  const all = getNetwork();
  const mode = args.status ?? "errors";
  const filtered = all.filter((e) => {
    if (args.urlContains && !e.url.includes(args.urlContains)) return false;
    if (mode === "all") return true;
    if (mode === "4xx")
      return e.status !== undefined && e.status >= 400 && e.status < 500;
    if (mode === "5xx") return e.status !== undefined && e.status >= 500;
    return e.failed || (e.status !== undefined && e.status >= 400);
  });
  if (args.clear) clearNetwork();
  return ok({ ok: true, total: filtered.length, entries: filtered });
}

export async function urlHandler() {
  const r = await evalInBrowser("location.href", 1000);
  return r.ok ? ok({ ok: true, url: r.value }) : fail(r.error);
}

export async function visibilityHandler(args: { selector: string }) {
  const script = `
    (() => {
      const el = document.querySelector(${JSON.stringify(args.selector)});
      if (!el) return { visible: false, exists: false };
      const rects = el.getClientRects();
      if (rects.length === 0) return { visible: false, exists: true };
      const cs = getComputedStyle(el);
      return { visible: cs.visibility !== "hidden" && cs.display !== "none", exists: true };
    })()
  `;
  const r = await evalInBrowser(script, 1000);
  return r.ok ? ok({ ok: true, ...(r.value as object) }) : fail(r.error);
}

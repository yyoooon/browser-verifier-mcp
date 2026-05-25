import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  clickByText,
  clickAndWaitForUrl,
  fillReactInput,
  navigate,
  reload,
} from "../cdp/actions.js";
import { ok, fail } from "../lib/result.js";

export const clickDefinition: Tool = {
  name: "browser_click",
  description:
    "Click an interactive element matched by visible text or aria-label. Tries exact text match first, then substring, then aria-label. Scoped to button/link/role elements.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Visible text or aria-label" },
    },
    required: ["text"],
  },
};

export const navigateDefinition: Tool = {
  name: "browser_navigate",
  description:
    "Click an element by text, then wait until the URL matches expectedUrl. Combines click + wait_url. Use for in-app router navigation triggered by a click.",
  inputSchema: {
    type: "object",
    properties: {
      clickText: { type: "string" },
      expectedUrl: {
        type: "string",
        description:
          'Expected URL suffix or glob. e.g. "/details" or "**/dashboard"',
      },
      timeoutMs: { type: "number" },
    },
    required: ["clickText", "expectedUrl"],
  },
};

export const fillInputDefinition: Tool = {
  name: "browser_fill_input",
  description:
    "Fill a React-controlled input or textarea using the native setter + input/change events. Required for React inputs — direct value assignment is not detected.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string" },
      value: { type: "string" },
    },
    required: ["selector", "value"],
  },
};

export const navigateUrlDefinition: Tool = {
  name: "browser_goto",
  description:
    "Full-page navigation to a URL via Page.navigate (not a click). Use to enter a route directly or load an external URL. Returns the final URL.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      timeoutMs: { type: "number" },
    },
    required: ["url"],
  },
};

export const reloadDefinition: Tool = {
  name: "browser_reload",
  description: "Reload the current page via Page.reload.",
  inputSchema: { type: "object", properties: {} },
};

export async function clickHandler(args: { text: string }) {
  const r = await clickByText(args.text);
  return r.ok
    ? ok({
        ok: true,
        matched: r.matched,
        clickedText: r.clickedText,
        hydrated: r.hydrated,
        waitedMs: r.waitedMs,
        elapsedMs: r.elapsedMs,
      })
    : fail(r.error ?? "click failed", { elapsedMs: r.elapsedMs });
}

export async function navigateHandler(args: {
  clickText: string;
  expectedUrl: string;
  timeoutMs?: number;
}) {
  const r = await clickAndWaitForUrl(
    args.clickText,
    args.expectedUrl,
    args.timeoutMs,
  );
  return r.ok
    ? ok({ ok: true, finalUrl: r.finalUrl, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "navigate failed", {
        finalUrl: r.finalUrl,
        elapsedMs: r.elapsedMs,
      });
}

export async function fillInputHandler(args: {
  selector: string;
  value: string;
}) {
  const r = await fillReactInput(args.selector, args.value);
  return r.ok
    ? ok({ ok: true, finalValue: r.finalValue, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "fill failed", { elapsedMs: r.elapsedMs });
}

export async function gotoHandler(args: { url: string; timeoutMs?: number }) {
  const r = await navigate(args.url, args.timeoutMs);
  return r.ok
    ? ok({ ok: true, finalUrl: r.finalUrl, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "navigate failed", { elapsedMs: r.elapsedMs });
}

export async function reloadHandler() {
  const r = await reload();
  return r.ok
    ? ok({ ok: true, finalUrl: r.finalUrl, elapsedMs: r.elapsedMs })
    : fail(r.error ?? "reload failed", { elapsedMs: r.elapsedMs });
}

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureAttached } from "../cdp/client.js";
import { ok, fail } from "../lib/result.js";

const DEFAULT_DIR = process.env.AGENT_BROWSER_SCREENSHOT_DIR ?? "/tmp";
const DEFAULT_FORMAT =
  (process.env.AGENT_BROWSER_SCREENSHOT_FORMAT as "jpeg" | "png" | undefined) ??
  "jpeg";
const DEFAULT_QUALITY = Number(
  process.env.AGENT_BROWSER_SCREENSHOT_QUALITY ?? "70",
);

export const definition: Tool = {
  name: "browser_screenshot",
  description:
    'Capture a screenshot of the attached page via CDP Page.captureScreenshot. JPEG @ 70% by default (small token cost when Read back). Use ONLY for cat 1-a visual sanity ("did the change land on screen?") — NOT for pixel-perfect diffing. Returns { path } so caller can Read it for multimodal inspection.',
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: 'File name without extension. Default "shot".',
      },
      fullPage: {
        type: "boolean",
        description:
          "Capture full scroll height (default false = viewport only).",
      },
      format: {
        type: "string",
        enum: ["jpeg", "png"],
      },
      quality: {
        type: "number",
        description: "JPEG quality 1-100 (default 70).",
      },
    },
  },
};

export async function handler(args: {
  name?: string;
  fullPage?: boolean;
  format?: "jpeg" | "png";
  quality?: number;
}) {
  const t0 = Date.now();
  try {
    const cdp = await ensureAttached();
    const format = args.format ?? DEFAULT_FORMAT;
    const quality = args.quality ?? DEFAULT_QUALITY;
    const params: Record<string, unknown> = {
      format,
      captureBeyondViewport: !!args.fullPage,
    };
    if (format === "jpeg") params.quality = quality;

    const result = await cdp.client.Page.captureScreenshot(params as never);
    const buf = Buffer.from(result.data, "base64");

    mkdirSync(DEFAULT_DIR, { recursive: true });
    const safeName = (args.name ?? "shot").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = join(DEFAULT_DIR, `${safeName}.${format}`);
    writeFileSync(path, buf);

    return ok({
      ok: true,
      path,
      bytes: buf.length,
      format,
      elapsedMs: Date.now() - t0,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), {
      elapsedMs: Date.now() - t0,
    });
  }
}

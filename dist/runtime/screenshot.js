import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureAttached } from "./client.js";
const DEFAULT_DIR = process.env.AGENT_BROWSER_SCREENSHOT_DIR ?? "/tmp";
const DEFAULT_FORMAT = process.env.AGENT_BROWSER_SCREENSHOT_FORMAT ??
    "jpeg";
const DEFAULT_QUALITY = Number(process.env.AGENT_BROWSER_SCREENSHOT_QUALITY ?? "70");
export async function captureScreenshot(opts = {}) {
    const t0 = Date.now();
    const state = await ensureAttached();
    const format = opts.format ?? DEFAULT_FORMAT;
    const quality = opts.quality ?? DEFAULT_QUALITY;
    const options = {
        type: format,
        fullPage: !!opts.fullPage,
    };
    if (format === "jpeg")
        options.quality = quality;
    const buf = await state.page.screenshot(options);
    mkdirSync(DEFAULT_DIR, { recursive: true });
    const safeName = (opts.name ?? "shot").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = join(DEFAULT_DIR, `${safeName}.${format}`);
    writeFileSync(path, buf);
    return {
        ok: true,
        path,
        bytes: buf.length,
        format,
        elapsedMs: Date.now() - t0,
    };
}
//# sourceMappingURL=screenshot.js.map
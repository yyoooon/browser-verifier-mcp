import { captureScreenshot } from "../runtime/screenshot.js";
import { ok, fail } from "../lib/result.js";
export const definition = {
    name: "browser_screenshot",
    description: 'Capture a screenshot of the attached page via Playwright page.screenshot. JPEG @ 70% by default (small token cost when Read back). Use ONLY for cat 1-a visual sanity ("did the change land on screen?") — NOT for pixel-perfect diffing. Returns { path } so caller can Read it for multimodal inspection.',
    inputSchema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: 'File name without extension. Default "shot".',
            },
            fullPage: {
                type: "boolean",
                description: "Capture full scroll height (default false = viewport only).",
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
export async function handler(args) {
    const t0 = Date.now();
    try {
        const r = await captureScreenshot(args);
        return ok(r);
    }
    catch (e) {
        return fail(e instanceof Error ? e.message : String(e), {
            elapsedMs: Date.now() - t0,
        });
    }
}
//# sourceMappingURL=screenshot.js.map
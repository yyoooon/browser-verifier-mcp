import type { Page } from "playwright-core";
import { globMatch } from "../../lib/glob.js";

export interface WaitRouteChangeOptions {
  timeoutMs?: number;
}

export interface WaitRouteChangeResult {
  ok: boolean;
  url: string;
  elapsedMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

export async function waitRouteChange(
  page: Page,
  pattern: string,
  options: WaitRouteChangeOptions = {},
): Promise<WaitRouteChangeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();

  try {
    await page.waitForURL((url) => globMatch(pattern, url.toString()), {
      timeout: timeoutMs,
    });
    return {
      ok: true,
      url: page.url(),
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      url: page.url(),
      elapsedMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

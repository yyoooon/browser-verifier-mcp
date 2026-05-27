import type { Locator, Page } from "playwright-core";
import { waitPageStable } from "../navigation/waitPageStable.js";

export interface SafeClickOptions {
  timeoutMs?: number;
  stabilize?: boolean;
  stabilizeTimeoutMs?: number;
}

export interface SafeClickResult {
  ok: boolean;
  elapsedMs: number;
  stabilizedMs?: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

export async function safeClick(
  locator: Locator,
  options: SafeClickOptions = {},
): Promise<SafeClickResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wantStabilize = options.stabilize ?? true;
  const stabilizeTimeoutMs = options.stabilizeTimeoutMs ?? 3000;

  const started = Date.now();

  try {
    await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    // Native element.click() instead of Playwright's coordinate dispatch:
    // coordinate hit-testing fails for buttons inside portaled overlays
    // (Radix Dialog/Sheet) — the trusted click never reaches the React
    // onClick handler. element.click() invokes the handler directly.
    await locator.evaluate((el) => (el as HTMLElement).click());
  } catch (e) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let stabilizedMs: number | undefined;
  if (wantStabilize) {
    const page: Page = locator.page();
    const r = await waitPageStable(page, { timeoutMs: stabilizeTimeoutMs });
    stabilizedMs = r.elapsedMs;
  }

  return {
    ok: true,
    elapsedMs: Date.now() - started,
    stabilizedMs,
  };
}

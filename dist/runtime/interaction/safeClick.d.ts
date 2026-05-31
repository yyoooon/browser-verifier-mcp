import type { Locator } from "playwright-core";
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
export declare function safeClick(locator: Locator, options?: SafeClickOptions): Promise<SafeClickResult>;

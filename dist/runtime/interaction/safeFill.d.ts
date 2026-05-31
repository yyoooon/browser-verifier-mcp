import type { Locator } from "playwright-core";
export interface SafeFillOptions {
    timeoutMs?: number;
}
export interface SafeFillResult {
    ok: boolean;
    finalValue?: string;
    usedFallback: boolean;
    elapsedMs: number;
    error?: string;
}
export declare function safeFill(locator: Locator, value: string, options?: SafeFillOptions): Promise<SafeFillResult>;

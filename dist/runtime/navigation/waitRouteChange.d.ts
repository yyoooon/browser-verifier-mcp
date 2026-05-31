import type { Page } from "playwright-core";
export interface WaitRouteChangeOptions {
    timeoutMs?: number;
}
export interface WaitRouteChangeResult {
    ok: boolean;
    url: string;
    elapsedMs: number;
    error?: string;
}
export declare function waitRouteChange(page: Page, pattern: string, options?: WaitRouteChangeOptions): Promise<WaitRouteChangeResult>;

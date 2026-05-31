import type { Page } from "playwright-core";
export interface WaitPageStableOptions {
    timeoutMs?: number;
    networkIdle?: boolean;
    animations?: boolean;
}
export interface WaitPageStableResult {
    ok: boolean;
    elapsedMs: number;
    reachedNetworkIdle: boolean;
    reachedAnimationsIdle: boolean;
    error?: string;
}
export declare function waitPageStable(page: Page, options?: WaitPageStableOptions): Promise<WaitPageStableResult>;

import type { Page } from "playwright-core";
export declare function installTransitionGuard(page: Page): Promise<void>;
export declare function removeTransitionGuard(page: Page): Promise<void>;

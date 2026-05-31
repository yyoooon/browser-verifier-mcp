import { type Browser, type BrowserContext, type Page } from "playwright-core";
export interface RuntimeState {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    targetId: string;
    url: string;
    port: number;
    cdpUrl: string;
}
export interface AttachInfo {
    port: number;
    targetId: string;
    url: string;
    cdpUrl: string;
}
export declare function attach(port: number, cdpUrl?: string): Promise<AttachInfo>;
export declare function ensureAttached(): Promise<RuntimeState>;
export declare function getCurrent(): RuntimeState | null;
export declare function detach(): Promise<void>;

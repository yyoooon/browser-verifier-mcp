export interface WaitResult {
    ok: boolean;
    elapsedMs: number;
    finalValue?: unknown;
    error?: string;
}
export declare function waitForUrl(pattern: string | undefined, timeoutMs?: number): Promise<WaitResult>;
export declare function waitForText(text: string, timeoutMs?: number): Promise<WaitResult>;
export declare function waitForSelector(selector: string, timeoutMs?: number): Promise<WaitResult>;
export declare function waitForGone(selector: string, timeoutMs?: number): Promise<WaitResult>;
export declare function waitForLoad(state?: "load" | "domcontentloaded" | "networkidle" | "hydrated", timeoutMs?: number): Promise<WaitResult>;

export interface ClickResult {
    ok: boolean;
    matched?: number;
    clickedText?: string;
    hydrated?: boolean;
    waitedMs?: number;
    error?: string;
    elapsedMs: number;
}
export declare function clickByText(text: string, hydrationTimeoutMs?: number): Promise<ClickResult>;
export interface NavigateClickResult {
    ok: boolean;
    finalUrl?: string;
    error?: string;
    elapsedMs: number;
}
export declare function clickAndWaitForUrl(clickText: string, expectedUrl: string, timeoutMs?: number): Promise<NavigateClickResult>;
export interface FillInputResult {
    ok: boolean;
    finalValue?: string;
    error?: string;
    elapsedMs: number;
}
export declare function fillReactInput(selector: string, value: string): Promise<FillInputResult>;
export interface NavigateResult {
    ok: boolean;
    finalUrl?: string;
    error?: string;
    elapsedMs: number;
}
export declare function navigate(url: string, timeoutMs?: number): Promise<NavigateResult>;
export declare function reload(): Promise<NavigateResult>;
export interface ActionResult {
    ok: boolean;
    error?: string;
    elapsedMs: number;
}
export declare function pressKey(key: string, selector?: string): Promise<ActionResult>;
export declare function selectOption(selector: string, option: {
    value?: string;
    label?: string;
}): Promise<ActionResult>;

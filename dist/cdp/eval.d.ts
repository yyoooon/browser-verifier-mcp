export interface EvalSuccess {
    ok: true;
    value: unknown;
    elapsedMs: number;
}
export interface EvalFailure {
    ok: false;
    error: string;
    elapsedMs: number;
}
export type EvalResult = EvalSuccess | EvalFailure;
export declare function evalInBrowser(script: string, timeoutMs?: number): Promise<EvalResult>;

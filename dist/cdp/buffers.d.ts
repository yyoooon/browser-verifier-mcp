import type { Page } from "playwright-core";
export interface ConsoleEntry {
    level: "log" | "info" | "warning" | "error" | "debug" | "trace";
    text: string;
    ts: number;
}
export interface NetworkEntry {
    requestId: string;
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    type?: string;
    failed?: boolean;
    failureText?: string;
    startedAt: number;
    endedAt?: number;
}
export declare function attachBuffers(page: Page): void;
export declare function getConsole(): ConsoleEntry[];
export declare function flushConsole(): Promise<void>;
export declare function clearConsole(): void;
export declare function getNetwork(): NetworkEntry[];
export declare function clearNetwork(): void;
export declare function detachBuffers(): void;

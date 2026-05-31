import type { Page } from "playwright-core";
export interface InspectTarget {
    selector: string;
    style?: string[];
    text?: boolean;
    classList?: boolean;
    rect?: boolean | string[];
    attr?: string[];
}
export type InspectInput = Record<string, InspectTarget>;
export type InspectObservation = {
    __error: "SELECTOR_NOT_FOUND";
    selector: string;
} | Record<string, unknown>;
export interface InspectResult {
    ok: true;
    values: Record<string, InspectObservation>;
    elapsedMs: number;
}
export declare function runInspect(page: Page, input: InspectInput): Promise<InspectResult>;

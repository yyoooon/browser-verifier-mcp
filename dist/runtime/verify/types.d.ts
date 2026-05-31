import type { SemanticState } from "../semantic/extractSemanticState.js";
export type VerifyCheck = {
    type: "primary_cta";
    expectedText?: string;
    mustBeEnabled?: boolean;
} | {
    type: "no_errors";
} | {
    type: "loaded";
    timeoutMs?: number;
} | {
    type: "route";
    expected: string;
} | {
    type: "modal_open";
    expectedTitle?: string;
} | {
    type: "modal_closed";
} | {
    type: "heading_present";
    text: string;
} | {
    type: "input_count";
    min?: number;
    max?: number;
    exact?: number;
} | {
    type: "computed_style";
    selector: string;
    prop: string;
    expected: string;
} | {
    type: "class_present";
    selector: string;
    className: string;
} | {
    type: "class_absent";
    selector: string;
    className: string;
};
export interface CheckResult {
    type: VerifyCheck["type"];
    ok: boolean;
    message?: string;
    observed?: unknown;
}
export interface VerifyResult {
    ok: boolean;
    checks: CheckResult[];
    state: SemanticState;
    elapsedMs: number;
}

import type { Page } from "playwright-core";
import type { CheckResult, FigmaSpec } from "../types.js";
export declare function loadSpec(spec: FigmaSpec | string): FigmaSpec;
export declare function runFigmaSpec(page: Page, spec: FigmaSpec): Promise<CheckResult[]>;

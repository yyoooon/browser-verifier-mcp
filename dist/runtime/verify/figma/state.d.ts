import type { Page } from "playwright-core";
import type { FigmaState } from "../types.js";
export declare function applyState(page: Page, selector: string, state: FigmaState): Promise<void>;
export declare function resetState(page: Page, state: FigmaState): Promise<void>;

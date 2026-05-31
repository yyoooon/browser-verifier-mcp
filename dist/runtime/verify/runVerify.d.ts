import type { Page } from "playwright-core";
import type { VerifyCheck, VerifyResult } from "./types.js";
export declare function runVerify(page: Page, checks: VerifyCheck[]): Promise<VerifyResult>;

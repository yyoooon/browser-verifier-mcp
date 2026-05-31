import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { VerifyCheck } from "../runtime/verify/types.js";
export declare const definition: Tool;
export declare function handler(args: {
    checks: VerifyCheck[];
}): Promise<import("../lib/result.js").ToolResult>;

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const definition: Tool;
export declare function handler(args: {
    script: string;
    timeoutMs?: number;
}): Promise<import("../lib/result.js").ToolResult>;

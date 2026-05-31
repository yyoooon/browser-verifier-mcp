import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const definition: Tool;
export declare function handler(args: {
    projectRoot?: string;
}): Promise<import("../lib/result.js").ToolResult>;

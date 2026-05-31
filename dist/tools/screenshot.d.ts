import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const definition: Tool;
export declare function handler(args: {
    name?: string;
    fullPage?: boolean;
    format?: "jpeg" | "png";
    quality?: number;
}): Promise<import("../lib/result.js").ToolResult>;

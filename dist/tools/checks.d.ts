import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const consoleDefinition: Tool;
export declare const networkDefinition: Tool;
export declare const urlDefinition: Tool;
export declare const visibilityDefinition: Tool;
export declare function consoleHandler(args: {
    level?: "error" | "warning" | "log" | "info" | "debug" | "all";
    clear?: boolean;
    includeNoise?: boolean;
}): Promise<import("../lib/result.js").ToolResult>;
export declare function networkHandler(args: {
    status?: "all" | "errors" | "4xx" | "5xx";
    urlContains?: string;
    clear?: boolean;
}): Promise<import("../lib/result.js").ToolResult>;
export declare function urlHandler(): Promise<import("../lib/result.js").ToolResult>;
export declare function visibilityHandler(args: {
    selector: string;
}): Promise<import("../lib/result.js").ToolResult>;

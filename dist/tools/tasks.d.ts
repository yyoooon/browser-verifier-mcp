import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TaskOp } from "../runtime/tasks/types.js";
export declare const loadDefinition: Tool;
export declare function loadHandler(args: {
    path: string;
}): Promise<import("../lib/result.js").ToolResult>;
export declare const listDefinition: Tool;
export declare function listHandler(): Promise<import("../lib/result.js").ToolResult>;
export declare const runDefinition: Tool;
export declare function runHandler(args: {
    name?: string;
    steps?: TaskOp[];
    args?: Record<string, unknown>;
}): Promise<import("../lib/result.js").ToolResult>;

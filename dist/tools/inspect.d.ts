import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { InspectInput } from "../runtime/inspect/runInspect.js";
export declare const definition: Tool;
export declare function handler(args: {
    targets: InspectInput;
}): Promise<import("../lib/result.js").ToolResult>;

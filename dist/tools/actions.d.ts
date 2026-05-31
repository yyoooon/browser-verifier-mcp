import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const fillDefinition: Tool;
export declare function fillHandler(args: {
    selector: string;
    value: string;
}): Promise<import("../lib/result.js").ToolResult>;
export declare const clickDefinition: Tool;
export declare function clickHandler(args: {
    selector?: string;
    text?: string;
}): Promise<import("../lib/result.js").ToolResult>;
export declare const pressKeyDefinition: Tool;
export declare function pressKeyHandler(args: {
    selector?: string;
    key: string;
}): Promise<import("../lib/result.js").ToolResult>;
export declare const selectOptionDefinition: Tool;
export declare function selectOptionHandler(args: {
    triggerSelector?: string;
    triggerText?: string;
    optionText: string;
}): Promise<import("../lib/result.js").ToolResult>;
export declare const navigateDefinition: Tool;
export declare function navigateHandler(args: {
    url: string;
    timeoutMs?: number;
}): Promise<import("../lib/result.js").ToolResult>;

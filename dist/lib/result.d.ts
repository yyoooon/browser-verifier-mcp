export interface ToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
}
export declare function ok(payload: unknown): ToolResult;
export declare function fail(error: string, extra?: Record<string, unknown>): ToolResult;

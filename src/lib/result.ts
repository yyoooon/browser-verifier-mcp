export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(payload: unknown): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

export function fail(
  error: string,
  extra?: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: false, error, ...(extra ?? {}) }),
      },
    ],
    isError: true,
  };
}

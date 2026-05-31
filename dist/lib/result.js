export function ok(payload) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
    };
}
export function fail(error, extra) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ ok: false, error, ...(extra ?? {}) }),
            },
        ],
        isError: true,
    };
}
//# sourceMappingURL=result.js.map
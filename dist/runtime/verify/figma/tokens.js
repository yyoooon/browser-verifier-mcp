// String entries assert the class is on the element (token-usage).
// Object entries additionally verify the token actually paints the screen
// via a reference swatch (token-swatch) — palette-immune, no baked rgb.
export function partitionTokens(tokens) {
    const classNames = [];
    const swatches = [];
    for (const t of tokens ?? []) {
        if (typeof t === "string") {
            classNames.push(t);
        }
        else {
            classNames.push(t.class);
            swatches.push(t);
        }
    }
    return { classNames, swatches };
}
//# sourceMappingURL=tokens.js.map
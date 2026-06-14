const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export function normalizeExpected(prop, expected) {
    const v = expected.trim();
    const hex = parseHex(v);
    if (hex)
        return hex;
    return v;
}
function parseHex(input) {
    const m = HEX_RE.exec(input);
    if (!m)
        return null;
    let hex = m[1];
    if (hex.length === 3) {
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const a = parseInt(hex.slice(6, 8), 16) / 255;
        return `rgba(${r}, ${g}, ${b}, ${roundAlpha(a)})`;
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
}
function roundAlpha(a) {
    const rounded = Math.round(a * 100) / 100;
    return rounded.toString();
}
//# sourceMappingURL=normalize.js.map
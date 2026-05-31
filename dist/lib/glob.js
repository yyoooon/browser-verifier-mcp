export function globToRegExp(pattern) {
    const re = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "::DOUBLESTAR::")
        .replace(/\*/g, "[^/]*")
        .replace(/::DOUBLESTAR::/g, ".*");
    return new RegExp(`^${re}$`);
}
export function globMatch(pattern, str) {
    return globToRegExp(pattern).test(str);
}
//# sourceMappingURL=glob.js.map
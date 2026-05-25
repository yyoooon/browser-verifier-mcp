export function globToRegExp(pattern: string): RegExp {
  const re = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`^${re}$`);
}

export function globMatch(pattern: string, str: string): boolean {
  return globToRegExp(pattern).test(str);
}

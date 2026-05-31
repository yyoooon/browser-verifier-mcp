export async function runInspect(page, input) {
    const t0 = Date.now();
    const targets = Object.entries(input).map(([key, spec]) => ({ key, ...spec }));
    const values = await page.evaluate((ts) => {
        const out = {};
        for (const t of ts) {
            const el = document.querySelector(t.selector);
            if (!el) {
                out[t.key] = { __error: "SELECTOR_NOT_FOUND", selector: t.selector };
                continue;
            }
            const obs = {};
            if (t.style && t.style.length > 0) {
                const cs = getComputedStyle(el);
                const csAny = cs;
                for (const prop of t.style) {
                    let v = csAny[prop];
                    if (v === undefined || v === "") {
                        const kebab = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
                        v = cs.getPropertyValue(kebab).trim();
                    }
                    obs[prop] = v;
                }
            }
            if (t.text) {
                obs.text = (el.textContent || "").trim();
            }
            if (t.classList) {
                obs.classList = Array.from(el.classList);
            }
            if (t.rect) {
                const r = el.getBoundingClientRect();
                const keys = Array.isArray(t.rect)
                    ? t.rect
                    : ["x", "y", "width", "height"];
                const rAny = r;
                for (const k of keys) {
                    obs[k] = Math.round((rAny[k] ?? 0) * 100) / 100;
                }
            }
            if (t.attr && t.attr.length > 0) {
                for (const a of t.attr) {
                    obs[a] = el.getAttribute(a);
                }
            }
            out[t.key] = obs;
        }
        return out;
    }, targets);
    return {
        ok: true,
        values,
        elapsedMs: Date.now() - t0,
    };
}
//# sourceMappingURL=runInspect.js.map
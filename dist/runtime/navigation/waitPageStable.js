const DEFAULT_TIMEOUT_MS = 5000;
export async function waitPageStable(page, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const wantNetworkIdle = options.networkIdle ?? true;
    const wantAnimationsIdle = options.animations ?? true;
    const started = Date.now();
    let reachedNetworkIdle = false;
    let reachedAnimationsIdle = false;
    try {
        await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
        if (wantNetworkIdle) {
            const remaining = remainingBudget(started, timeoutMs);
            await page.waitForLoadState("networkidle", { timeout: remaining });
            reachedNetworkIdle = true;
        }
        if (wantAnimationsIdle) {
            const remaining = remainingBudget(started, timeoutMs);
            await page.waitForFunction(() => {
                const anims = typeof document.getAnimations === "function"
                    ? document.getAnimations()
                    : [];
                return anims.every((a) => a.playState !== "running");
            }, undefined, { timeout: remaining, polling: 100 });
            reachedAnimationsIdle = true;
        }
        return {
            ok: true,
            elapsedMs: Date.now() - started,
            reachedNetworkIdle,
            reachedAnimationsIdle,
        };
    }
    catch (e) {
        return {
            ok: false,
            elapsedMs: Date.now() - started,
            reachedNetworkIdle,
            reachedAnimationsIdle,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
function remainingBudget(startedAt, totalMs) {
    const left = totalMs - (Date.now() - startedAt);
    return left > 0 ? left : 1;
}
//# sourceMappingURL=waitPageStable.js.map
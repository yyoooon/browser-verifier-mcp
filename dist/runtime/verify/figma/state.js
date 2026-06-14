export async function applyState(page, selector, state) {
    switch (state) {
        case "rest":
            return;
        case "hover":
            await page.hover(selector, { timeout: 2000 });
            return;
        case "focus":
            await page.focus(selector, { timeout: 2000 });
            return;
        case "active":
            await page.hover(selector, { timeout: 2000 });
            await page.mouse.down();
            return;
    }
}
export async function resetState(page, state) {
    switch (state) {
        case "rest":
            return;
        case "hover":
            await page.mouse.move(0, 0);
            return;
        case "focus":
            await page.evaluate(() => {
                const el = document.activeElement;
                if (el && typeof el.blur === "function")
                    el.blur();
            });
            return;
        case "active":
            await page.mouse.up();
            await page.mouse.move(0, 0);
            return;
    }
}
//# sourceMappingURL=state.js.map
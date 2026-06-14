const STYLE_ID = "__browser_verifier_transition_guard__";
const CSS = `
*, *::before, *::after {
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
`;
export async function installTransitionGuard(page) {
    await page.evaluate(({ id, css }) => {
        if (document.getElementById(id))
            return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }, { id: STYLE_ID, css: CSS });
}
export async function removeTransitionGuard(page) {
    await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (el)
            el.remove();
    }, STYLE_ID);
}
//# sourceMappingURL=transitionGuard.js.map
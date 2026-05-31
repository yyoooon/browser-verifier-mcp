import { chromium, } from "playwright-core";
import { findTargetByPort } from "../cdp/target.js";
import { attachBuffers, detachBuffers } from "../cdp/buffers.js";
import { CDP_BASE_URL } from "../cdp/config.js";
let state = null;
export async function attach(port) {
    if (state && state.port === port && (await isAlive(state.page))) {
        state.url = state.page.url();
        return { port: state.port, targetId: state.targetId, url: state.url };
    }
    if (state) {
        await closeQuiet(state.browser);
        state = null;
    }
    const target = await findTargetByPort(port);
    if (!target) {
        throw new Error(`No Chrome target at http(s)://localhost:${port}. Open the dev server in the Chrome instance attached to CDP at ${CDP_BASE_URL}.`);
    }
    const browser = await chromium.connectOverCDP(CDP_BASE_URL);
    const page = findPageByUrl(browser, target.url);
    if (!page) {
        await closeQuiet(browser);
        throw new Error(`Connected to CDP but could not locate the page for ${target.url}.`);
    }
    browser.on("disconnected", () => {
        if (state && state.browser === browser) {
            state = null;
            detachBuffers();
        }
    });
    state = {
        browser,
        context: page.context(),
        page,
        targetId: target.id,
        url: target.url,
        port,
    };
    attachBuffers(page);
    return { port, targetId: target.id, url: target.url };
}
export async function ensureAttached() {
    if (!state) {
        throw new Error("browser_setup not called. Invoke browser_setup({ port }) first.");
    }
    if (!(await isAlive(state.page))) {
        const port = state.port;
        state = null;
        await attach(port);
    }
    return state;
}
export function getCurrent() {
    return state;
}
export async function detach() {
    if (state) {
        await closeQuiet(state.browser);
        state = null;
    }
}
function findPageByUrl(browser, url) {
    for (const context of browser.contexts()) {
        for (const page of context.pages()) {
            if (page.url() === url)
                return page;
        }
    }
    let targetOrigin = null;
    try {
        targetOrigin = new URL(url).origin;
    }
    catch {
        return null;
    }
    for (const context of browser.contexts()) {
        for (const page of context.pages()) {
            try {
                if (new URL(page.url()).origin === targetOrigin)
                    return page;
            }
            catch {
                // ignore non-URL pages (about:blank etc.)
            }
        }
    }
    return null;
}
async function isAlive(page) {
    try {
        if (page.isClosed())
            return false;
        await page.evaluate(() => 1);
        return true;
    }
    catch {
        return false;
    }
}
async function closeQuiet(browser) {
    try {
        await browser.close();
    }
    catch {
        // ignore — connectOverCDP detach is best-effort
    }
}
//# sourceMappingURL=client.js.map
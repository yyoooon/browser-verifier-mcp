let consoleBuf = [];
const networkMap = new Map();
let attachedPage = null;
let nextRequestId = 1;
let listeners = [];
let pendingSerializations = [];
export function attachBuffers(page) {
    if (attachedPage === page)
        return;
    if (attachedPage)
        detachBuffers();
    attachedPage = page;
    consoleBuf = [];
    networkMap.clear();
    nextRequestId = 1;
    const onConsole = (msg) => {
        const ts = Date.now();
        const level = normalizeLevel(msg.type());
        const args = msg.args();
        if (args.length === 0) {
            consoleBuf.push({ level, text: msg.text(), ts });
            return;
        }
        const p = Promise.all(args.map(async (a) => {
            try {
                const v = await a.jsonValue();
                if (typeof v === "string")
                    return v;
                return JSON.stringify(v);
            }
            catch {
                return String(a);
            }
        })).then((parts) => {
            consoleBuf.push({ level, text: parts.join(" "), ts });
        }, () => {
            consoleBuf.push({ level, text: msg.text(), ts });
        });
        pendingSerializations.push(p);
    };
    page.on("console", onConsole);
    listeners.push({ event: "console", fn: onConsole });
    const onPageError = (err) => {
        consoleBuf.push({
            level: "error",
            text: err.message,
            ts: Date.now(),
        });
    };
    page.on("pageerror", onPageError);
    listeners.push({ event: "pageerror", fn: onPageError });
    const onRequest = (req) => {
        networkMap.set(req, {
            requestId: `req-${nextRequestId++}`,
            url: req.url(),
            method: req.method(),
            type: req.resourceType(),
            startedAt: Date.now(),
        });
    };
    page.on("request", onRequest);
    listeners.push({ event: "request", fn: onRequest });
    const onResponse = (res) => {
        const req = res.request();
        const entry = networkMap.get(req);
        if (entry) {
            entry.status = res.status();
            entry.statusText = res.statusText();
            entry.endedAt = Date.now();
        }
    };
    page.on("response", onResponse);
    listeners.push({ event: "response", fn: onResponse });
    const onRequestFailed = (req) => {
        const entry = networkMap.get(req);
        if (entry) {
            entry.failed = true;
            entry.failureText = req.failure()?.errorText ?? "request failed";
            entry.endedAt = Date.now();
        }
    };
    page.on("requestfailed", onRequestFailed);
    listeners.push({
        event: "requestfailed",
        fn: onRequestFailed,
    });
}
export function getConsole() {
    return [...consoleBuf];
}
export async function flushConsole() {
    if (pendingSerializations.length === 0)
        return;
    const snapshot = pendingSerializations;
    pendingSerializations = [];
    await Promise.all(snapshot).catch(() => undefined);
}
export function clearConsole() {
    consoleBuf = [];
}
export function getNetwork() {
    return [...networkMap.values()];
}
export function clearNetwork() {
    networkMap.clear();
}
export function detachBuffers() {
    if (attachedPage) {
        for (const { event, fn } of listeners) {
            try {
                attachedPage.off(event, fn);
            }
            catch {
                // ignore — page may already be closed
            }
        }
    }
    listeners = [];
    attachedPage = null;
    consoleBuf = [];
    networkMap.clear();
    pendingSerializations = [];
}
function normalizeLevel(type) {
    switch (type) {
        case "log":
        case "info":
        case "warning":
        case "error":
        case "debug":
        case "trace":
            return type;
        case "warn":
            return "warning";
        default:
            return "log";
    }
}
//# sourceMappingURL=buffers.js.map
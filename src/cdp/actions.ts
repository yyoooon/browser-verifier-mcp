import { ensureAttached } from "./client.js";
import { evalInBrowser } from "./eval.js";
import { waitForUrl } from "./wait.js";

export interface ClickResult {
  ok: boolean;
  matched?: number;
  clickedText?: string;
  hydrated?: boolean;
  waitedMs?: number;
  error?: string;
  elapsedMs: number;
}

export async function clickByText(
  text: string,
  hydrationTimeoutMs = 3000,
): Promise<ClickResult> {
  const t0 = Date.now();
  const script = `
    (async () => {
      const target = ${JSON.stringify(text)};
      const HYDRATION_TIMEOUT = ${hydrationTimeoutMs};
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const visible = (el) => {
        if (!el || !el.getClientRects) return false;
        if (el.getClientRects().length === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      const find = () => {
        const all = Array.from(document.querySelectorAll(
          "button, a, [role=button], [role=link], [role=tab], [role=menuitem], input[type=submit], input[type=button], label, [data-slot]"
        )).filter(visible);
        let hit = all.find((el) => el.textContent && el.textContent.trim() === target);
        if (!hit) hit = all.find((el) => el.textContent && el.textContent.trim().includes(target));
        if (!hit) hit = all.find((el) => el.getAttribute("aria-label") === target);
        return hit;
      };
      const isHydrated = (el) => {
        for (const k of Object.keys(el)) {
          if (k.startsWith("__reactFiber") || k.startsWith("__reactProps")) return true;
        }
        return false;
      };
      const FIND_TIMEOUT = 500;
      const start = Date.now();
      let hit = find();
      if (!hit) {
        while (Date.now() - start < FIND_TIMEOUT) {
          await sleep(50);
          hit = find();
          if (hit) break;
        }
      }
      if (!hit) return { ok: false, matched: 0, waitedMs: Date.now() - start };
      let hydrated = isHydrated(hit);
      while (!hydrated && Date.now() - start < HYDRATION_TIMEOUT) {
        await sleep(50);
        hit = find() || hit;
        hydrated = isHydrated(hit);
      }
      hit.scrollIntoView({ block: "center", inline: "center" });
      hit.click();
      return {
        ok: true,
        matched: 1,
        hydrated,
        waitedMs: Date.now() - start,
        clickedText: (hit.textContent || hit.getAttribute("aria-label") || "").trim().slice(0, 80),
      };
    })()
  `;
  const r = await evalInBrowser(script, hydrationTimeoutMs + 2000);
  if (!r.ok) return { ok: false, error: r.error, elapsedMs: Date.now() - t0 };
  const v = r.value as {
    ok: boolean;
    matched?: number;
    hydrated?: boolean;
    waitedMs?: number;
    clickedText?: string;
  };
  if (!v.ok) {
    return {
      ok: false,
      matched: v.matched ?? 0,
      error: `no clickable element with text "${text}"`,
      elapsedMs: Date.now() - t0,
    };
  }
  return {
    ok: true,
    matched: v.matched,
    clickedText: v.clickedText,
    hydrated: v.hydrated,
    waitedMs: v.waitedMs,
    elapsedMs: Date.now() - t0,
  };
}

export interface NavigateClickResult {
  ok: boolean;
  finalUrl?: string;
  error?: string;
  elapsedMs: number;
}

export async function clickAndWaitForUrl(
  clickText: string,
  expectedUrl: string,
  timeoutMs = 5000,
): Promise<NavigateClickResult> {
  const t0 = Date.now();
  const click = await clickByText(clickText);
  if (!click.ok) {
    return { ok: false, error: click.error, elapsedMs: Date.now() - t0 };
  }
  const wait = await waitForUrl(
    expectedUrl.startsWith("**") ? expectedUrl : `**${expectedUrl}`,
    timeoutMs,
  );
  return {
    ok: wait.ok,
    finalUrl: wait.finalValue as string | undefined,
    error: wait.ok ? undefined : wait.error,
    elapsedMs: Date.now() - t0,
  };
}

export interface FillInputResult {
  ok: boolean;
  finalValue?: string;
  error?: string;
  elapsedMs: number;
}

export async function fillReactInput(
  selector: string,
  value: string,
): Promise<FillInputResult> {
  const t0 = Date.now();
  const script = `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: "selector not found" };
      const tag = el.tagName;
      const proto = tag === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, finalValue: el.value };
    })()
  `;
  const r = await evalInBrowser(script);
  if (!r.ok) return { ok: false, error: r.error, elapsedMs: Date.now() - t0 };
  const v = r.value as { ok: boolean; error?: string; finalValue?: string };
  return { ...v, elapsedMs: Date.now() - t0 };
}

export interface NavigateResult {
  ok: boolean;
  finalUrl?: string;
  error?: string;
  elapsedMs: number;
}

export async function navigate(
  url: string,
  timeoutMs = 10000,
): Promise<NavigateResult> {
  const t0 = Date.now();
  try {
    const cdp = await ensureAttached();
    await cdp.client.Page.navigate({ url });
    const w = await waitForUrl("**", timeoutMs);
    const r = await evalInBrowser("location.href", 1000);
    return {
      ok: w.ok,
      finalUrl: r.ok ? (r.value as string) : undefined,
      error: w.ok ? undefined : w.error,
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - t0,
    };
  }
}

export async function reload(): Promise<NavigateResult> {
  const t0 = Date.now();
  try {
    const cdp = await ensureAttached();
    await cdp.client.Page.reload({});
    const r = await evalInBrowser("location.href", 1000);
    return {
      ok: true,
      finalUrl: r.ok ? (r.value as string) : undefined,
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - t0,
    };
  }
}

export async function activateTab(): Promise<void> {
  const cdp = await ensureAttached();
  await cdp.client.Page.bringToFront();
}

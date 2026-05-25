import type { Page } from "playwright";

export interface SemanticModal {
  title: string;
  visible: boolean;
}

export interface SemanticCTA {
  text: string;
  visible: boolean;
  enabled: boolean;
}

export interface SemanticFocused {
  tag: string;
  text: string;
}

export interface SemanticState {
  route: string;
  search: string;
  hash: string;
  title: string;
  loading: boolean;
  loadingHints: string[];
  modal: SemanticModal | null;
  primaryCTA: SemanticCTA | null;
  headings: string[];
  errors: string[];
  inputCount: number;
  focusedElement: SemanticFocused | null;
  elapsedMs: number;
}

export async function extractSemanticState(page: Page): Promise<SemanticState> {
  const t0 = Date.now();
  const raw = await page.evaluate(extractInPage);
  return { ...raw, elapsedMs: Date.now() - t0 };
}

// Runs inside the page. Self-contained (no closures over outer scope).
function extractInPage(): Omit<SemanticState, "elapsedMs"> {
  const TEXT_CAP = 120;
  const LIST_CAP = 5;

  const visible = (el: Element | null): boolean => {
    if (!el) return false;
    const he = el as HTMLElement;
    if (!he.getClientRects || he.getClientRects().length === 0) return false;
    const cs = getComputedStyle(he);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (parseFloat(cs.opacity || "1") === 0) return false;
    return true;
  };

  const trimText = (s: string | null | undefined, cap = TEXT_CAP): string => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > cap ? t.slice(0, cap - 1) + "…" : t;
  };

  // ---- loading ----
  const loadingHints: string[] = [];
  if (document.documentElement.getAttribute("aria-busy") === "true") {
    loadingHints.push("html[aria-busy]");
  }
  if (document.querySelector("[aria-busy=true]")) {
    loadingHints.push("[aria-busy=true]");
  }
  const progressEl = document.querySelector("[role=progressbar]");
  if (progressEl && visible(progressEl)) loadingHints.push("role=progressbar");
  const skeletons = Array.from(
    document.querySelectorAll(
      "[data-slot~=skeleton], [class*=skeleton i], [class*=Skeleton]",
    ),
  ).filter(visible);
  if (skeletons.length > 0) {
    loadingHints.push(`skeleton×${Math.min(skeletons.length, 99)}`);
  }
  const spinners = Array.from(
    document.querySelectorAll(
      "[class*=spinner i], [class*=Spinner], [class*=loading i]:not([class*=heading i])",
    ),
  ).filter(visible);
  if (spinners.length > 0) {
    loadingHints.push(`spinner×${Math.min(spinners.length, 99)}`);
  }

  // ---- modal ----
  let modal: SemanticModal | null = null;
  const dialogCandidates: Element[] = [];
  document
    .querySelectorAll(
      "dialog[open], [role=dialog], [role=alertdialog]",
    )
    .forEach((el) => {
      const dataState = el.getAttribute("data-state");
      if (dataState && dataState !== "open") return;
      if (visible(el)) dialogCandidates.push(el);
    });
  if (dialogCandidates.length > 0) {
    const top = dialogCandidates[dialogCandidates.length - 1];
    const titleEl =
      top.querySelector("[role=heading], h1, h2, h3, [data-slot=dialog-title]") ??
      top.querySelector("[id*=title i]");
    modal = {
      title: trimText(titleEl?.textContent ?? top.getAttribute("aria-label")),
      visible: true,
    };
  }

  // ---- primary CTA ----
  // Heuristic: prefer real page actions over nav. Three signals stacked:
  //   (1) inside <main>/[role=main], outside nav/header/aside/footer landmarks
  //   (2) type=submit
  //   (3) action keywords (Save/Submit/Create/등록/저장/확인/...)
  // Returns null if no candidate clears a minimum confidence threshold —
  // a dashboard with no clear action should not invent one.
  const PRIMARY_ACTIONS = [
    "save",
    "submit",
    "create",
    "add",
    "confirm",
    "send",
    "apply",
    "등록",
    "저장",
    "확인",
    "추가",
    "신청",
    "전송",
    "수정",
    "삭제",
    "완료",
  ];
  const SECONDARY_ACTIONS = [
    "continue",
    "next",
    "back",
    "search",
    "다음",
    "이전",
    "검색",
  ];
  const PAGINATION_ARIA =
    /^go to (next|previous|first|last|page \d+) page/i;
  const isInLandmark = (el: Element, tags: string[], roles: string[]): boolean => {
    let p: Element | null = el;
    while (p && p !== document.body) {
      if (tags.includes(p.tagName)) return true;
      const r = p.getAttribute("role");
      if (r && roles.includes(r)) return true;
      p = p.parentElement;
    }
    return false;
  };
  // Include <header> (page-level header often holds the CTA) but exclude
  // site-wide nav/sidebar/footer.
  const ctaScope = modal
    ? (dialogCandidates[dialogCandidates.length - 1] as Element)
    : document.body;
  let primaryCTA: SemanticCTA | null = null;
  const ctaCandidates = Array.from(
    ctaScope.querySelectorAll(
      "button[type=submit], input[type=submit], button, [role=button]",
    ),
  )
    .filter((el) => visible(el))
    .filter(
      (el) =>
        modal ||
        !isInLandmark(
          el,
          ["NAV", "ASIDE", "FOOTER"],
          ["navigation", "complementary", "contentinfo"],
        ),
    )
    .filter((el) => {
      const aria = el.getAttribute("aria-label") ?? "";
      const tc = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      return !PAGINATION_ARIA.test(aria) && !PAGINATION_ARIA.test(tc);
    })
    .map((el) => {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      const text = trimText(he.textContent ?? he.getAttribute("aria-label"), 80);
      const enabled = !(he as HTMLButtonElement).disabled;
      // HTMLButtonElement.type defaults to "submit" even without an explicit
      // attribute — only count buttons actually associated with a <form>.
      const isSubmit =
        (he as HTMLButtonElement).type === "submit" &&
        (he as HTMLButtonElement).form !== null;
      const lower = text.toLowerCase();
      const primaryMatch = PRIMARY_ACTIONS.some((kw) => lower.includes(kw));
      const secondaryMatch = SECONDARY_ACTIONS.some((kw) => lower.includes(kw));
      let score = 0;
      if (isSubmit) score += 60;
      if (primaryMatch) score += 50;
      else if (secondaryMatch) score += 15;
      if (he.tagName === "BUTTON") score += 5;
      const area = rect.width * rect.height;
      score += Math.min(area / 2000, 20);
      return { text, enabled, score, qualifies: isSubmit || primaryMatch };
    })
    .filter((c) => c.text.length > 0 && c.qualifies);
  if (ctaCandidates.length > 0) {
    ctaCandidates.sort((a, b) => b.score - a.score);
    const top = ctaCandidates[0];
    primaryCTA = {
      text: top.text,
      visible: true,
      enabled: top.enabled,
    };
  }

  // ---- headings ----
  const headings = Array.from(document.querySelectorAll("h1, h2"))
    .filter(visible)
    .slice(0, LIST_CAP)
    .map((el) => trimText(el.textContent));

  // ---- errors ----
  const errorElements: Element[] = [];
  document
    .querySelectorAll(
      "[role=alert], [aria-live=assertive], [data-slot=form-message][data-error=true], [data-state=error]",
    )
    .forEach((el) => {
      if (visible(el)) errorElements.push(el);
    });
  document
    .querySelectorAll('[class*="destructive" i], [class*="error" i]')
    .forEach((el) => {
      if (errorElements.length >= LIST_CAP * 2) return;
      if (visible(el) && (el.textContent ?? "").trim().length > 0) {
        errorElements.push(el);
      }
    });
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const el of errorElements) {
    const t = trimText(el.textContent);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    errors.push(t);
    if (errors.length >= LIST_CAP) break;
  }

  // ---- inputs ----
  const inputCount = Array.from(
    document.querySelectorAll("input, textarea, select"),
  ).filter(visible).length;

  // ---- focused ----
  let focusedElement: SemanticFocused | null = null;
  const ae = document.activeElement;
  if (
    ae &&
    ae !== document.body &&
    ae !== document.documentElement &&
    visible(ae)
  ) {
    focusedElement = {
      tag: ae.tagName,
      text: trimText(
        (ae as HTMLElement).innerText ??
          ae.getAttribute("aria-label") ??
          (ae as HTMLInputElement).value ??
          "",
        60,
      ),
    };
  }

  return {
    route: location.pathname,
    search: location.search,
    hash: location.hash,
    title: trimText(document.title, 80),
    loading: loadingHints.length > 0,
    loadingHints,
    modal,
    primaryCTA,
    headings,
    errors,
    inputCount,
    focusedElement,
  };
}

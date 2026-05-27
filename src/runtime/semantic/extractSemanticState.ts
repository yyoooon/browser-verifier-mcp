import type { Page } from "playwright-core";

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
    .querySelectorAll("dialog[open], [role=dialog], [role=alertdialog]")
    .forEach((el) => {
      const dataState = el.getAttribute("data-state");
      if (dataState && dataState !== "open") return;
      if (visible(el)) dialogCandidates.push(el);
    });
  if (dialogCandidates.length > 0) {
    const top = dialogCandidates[dialogCandidates.length - 1];
    const titleEl =
      top.querySelector(
        "[role=heading], h1, h2, h3, [data-slot=dialog-title]",
      ) ?? top.querySelector("[id*=title i]");
    modal = {
      title: trimText(titleEl?.textContent ?? top.getAttribute("aria-label")),
      visible: true,
    };
  }

  // ---- primary CTA ----
  // Language-agnostic first. A candidate QUALIFIES on structural signals — it is
  // a form submit, OR it is visually prominent (a real button, not a chip/icon),
  // OR (inside a modal) the modal's own action. Action keywords are NOT a gate —
  // they only break ties between qualified candidates, so detection still works
  // in any language without maintaining an exhaustive verb list. Nav/aside/footer
  // landmarks are excluded so site chrome is never mistaken for a page action.
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
  // Dismiss/escape actions are NOT a primary CTA. Affirmative vs. dismiss buttons
  // are structurally identical (same size/shape), so this is the one distinction
  // that needs words — but unlike affirmative verbs (an open-ended, per-locale
  // set) the dismiss vocabulary is small and stable, and it only DEMOTES score,
  // never gates qualification. Keeps the affirmative button on top of a typical
  // [Cancel] [Confirm] dialog.
  const DISMISS_ACTIONS = ["close", "cancel", "dismiss", "닫기", "취소"];
  const PAGINATION_ARIA = /^go to (next|previous|first|last|page \d+) page/i;
  const isInLandmark = (
    el: Element,
    tags: string[],
    roles: string[],
  ): boolean => {
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
      const text = trimText(
        he.textContent ?? he.getAttribute("aria-label"),
        80,
      );
      const enabled = !(he as HTMLButtonElement).disabled;
      // HTMLButtonElement.type defaults to "submit" even without an explicit
      // attribute — only count buttons actually associated with a <form>.
      const isSubmit =
        (he as HTMLButtonElement).type === "submit" &&
        (he as HTMLButtonElement).form !== null;
      const lower = text.toLowerCase();
      const primaryMatch = PRIMARY_ACTIONS.some((kw) => lower.includes(kw));
      const secondaryMatch = SECONDARY_ACTIONS.some((kw) => lower.includes(kw));
      // Qualification is structural only — keywords never gate it (substring
      // matches like "Add" in "Added to favorites" would otherwise pick toasts,
      // and the verb list cannot cover every locale). A candidate qualifies if
      // it is a form submit, or a prominent button with a short, CTA-like label
      // that is NOT a clickable content card. A real CTA's content is inline
      // (text + maybe an icon); a card wraps a content block — many descendant
      // elements, or nested headings/paragraphs. This split is language- and
      // framework-agnostic (no class-name or copy assumptions).
      const area = rect.width * rect.height;
      const MIN_PROMINENT_AREA = modal ? 2000 : 3000;
      const CTA_LABEL_MAX = 40;
      const shortLabel = text.length > 0 && text.length <= CTA_LABEL_MAX;
      const looksLikeContentCard =
        he.querySelectorAll("*").length > 6 ||
        he.querySelector("h1, h2, h3, h4, h5, h6, [role=heading], p") !== null;
      const prominent =
        area >= MIN_PROMINENT_AREA && shortLabel && !looksLikeContentCard;
      let score = 0;
      if (isSubmit) score += 60;
      if (he.tagName === "BUTTON") score += 5;
      score += Math.min(area / 1500, 40); // prominence is now a primary signal
      const dismissMatch = DISMISS_ACTIONS.some((kw) => lower.includes(kw));
      if (primaryMatch)
        score += 20; // keyword: tiebreaker only
      else if (secondaryMatch) score += 8;
      if (dismissMatch) score -= 30; // demote close/cancel below the real action
      if (!enabled) score -= 15; // prefer an enabled action when ranking
      return { text, enabled, score, qualifies: isSubmit || prominent };
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
  const headings = Array.from(
    document.querySelectorAll("h1, h2, h3, [role=heading]"),
  )
    .filter(visible)
    .slice(0, LIST_CAP)
    .map((el) => trimText(el.textContent));

  // ---- errors ----
  // ARIA-first, framework-agnostic. Class-name matching (`[class*=destructive]`,
  // `[class*=error]`) is unreliable across stacks: utility frameworks bake error
  // *variants* into base class lists (e.g. `aria-invalid:ring-destructive` on
  // every button) and error *colors* are reused for non-error styling, so the
  // substring matches things that are not active errors. Standard error roles
  // are the portable signal; a couple of widespread component-lib conventions
  // (`[data-state=error]`, `[data-slot=form-message]`) are included as a bonus.
  const errorElements: Element[] = [];
  document
    .querySelectorAll(
      "[role=alert], [aria-live=assertive], [aria-invalid=true], [data-state=error], [data-slot=form-message]",
    )
    .forEach((el) => {
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

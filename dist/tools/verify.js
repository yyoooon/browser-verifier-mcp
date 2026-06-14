import { ensureAttached } from "../runtime/client.js";
import { runVerify } from "../runtime/verify/runVerify.js";
import { ok, fail } from "../lib/result.js";
export const definition = {
    name: "browser_verify",
    description: "Run a batch of generic, structured verifications against ONE semantic snapshot of the page (state checks) plus one batched DOM query (style/class checks). Returns { ok, checks: [...], state, elapsedMs }. ok is true iff every check passed. Prefer this over multiple browser_eval calls for assertion-style verification. Check types:\n" +
        "  State (read SemanticState):\n" +
        "  - { type: 'primary_cta', expectedText?, mustBeEnabled? } — primaryCTA exists; optionally text contains expectedText; optionally must be enabled.\n" +
        "  - { type: 'no_errors' } — no visible error alerts.\n" +
        "  - { type: 'loaded', timeoutMs? } — page not in loading state; polls up to timeoutMs ms if still loading.\n" +
        "  - { type: 'route', expected } — current location matches glob (e.g. '**/dashboard', '/users/*').\n" +
        "  - { type: 'modal_open', expectedTitle? } — a dialog is open; optionally title contains expectedTitle.\n" +
        "  - { type: 'modal_closed' } — no dialog open.\n" +
        "  - { type: 'heading_present', text } — at least one h1/h2 contains text.\n" +
        "  - { type: 'input_count', min?, max?, exact? } — visible input/textarea/select count constraint.\n" +
        "  DOM (one batched querySelector + getComputedStyle / classList):\n" +
        "  - { type: 'computed_style', selector, prop, expected } — getComputedStyle(el)[prop] === expected (exact string match).\n" +
        "    prop accepts camelCase (backgroundColor, paddingLeft) or kebab-case (background-color).\n" +
        "    expected MUST be the BROWSER-NORMALIZED form, not Figma raw: '#d6eafa' → 'rgb(214, 234, 250)', '1rem' → '16px', 'bold' → '700'.\n" +
        "    Tailwind v4 theme colors output oklch(); arbitrary values (bg-[#hex]) stay rgb(). If unsure, run browser_eval once to capture the actual computed value, then bake it into the check.\n" +
        "  - { type: 'class_present', selector, className } — el.classList.contains(className).\n" +
        "  - { type: 'class_absent', selector, className } — !el.classList.contains(className).\n" +
        "  Figma spec (high-level, expands into multiple sub-results):\n" +
        "  - { type: 'figma_spec', spec } — spec is either a FigmaSpec object or a string path to a figma-spec.json file. Walks spec.targets[]; for each target applies state (rest|hover|focus|active) via Playwright native input, measures computed style for typography (fontSize, fontWeight, lineHeight, letterSpacing, fontFamily) and arbitrary style props, then compares with EXACT equality. Hex (#rrggbb / #rrggbbaa) in expected is auto-normalized to rgb()/rgba(); transitions/animations are zeroed during measurement so hover/focus/active state values are not mid-animation. Optional spec.cssVariables [] verifies each CSS variable is declared on :root (catches missing design tokens — message prefix '[token-declared]'). Optional target.tokens [] verifies expected className tokens appear in the element's classList (catches raw/arbitrary hex bypassing the design system — message prefix '[token-usage]'). Automatic spec coverage check: if a required category (color | border | typography | spacing) has no prop in spec, emits a '[spec-coverage]' sub-result (warning by default, fail if spec.strict=true). Silence with spec.skipCategories: ['spacing', ...]. Ignored props (silently dropped if put in spec.style): transition*, animation*, cursor, boxSizing — these are non-visual or guarded. One figma_spec check yields one sub-result per (target × prop) plus one per declared/usage token plus coverage warnings. When [token-declared] or [spec-coverage] failures appear, surface them to the user and ask how to handle (add to theme, keep arbitrary, remap, ignore / silence category). For workflow details see skills/verify/references/figma-spec-workflow.md.\n" +
        "  For Figma → Tailwind verification patterns see skills/verify/references/figma-tailwind-check.md.",
    inputSchema: {
        type: "object",
        properties: {
            checks: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: [
                                "primary_cta",
                                "no_errors",
                                "loaded",
                                "route",
                                "modal_open",
                                "modal_closed",
                                "heading_present",
                                "input_count",
                                "computed_style",
                                "class_present",
                                "class_absent",
                                "figma_spec",
                            ],
                        },
                    },
                    required: ["type"],
                    additionalProperties: true,
                },
            },
        },
        required: ["checks"],
    },
};
export async function handler(args) {
    try {
        const state = await ensureAttached();
        const result = await runVerify(state.page, args.checks);
        return result.ok
            ? ok(result)
            : fail("one or more checks failed", {
                checks: result.checks,
                state: result.state,
                elapsedMs: result.elapsedMs,
            });
    }
    catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
    }
}
//# sourceMappingURL=verify.js.map
// MCP server instructions — injected into the client's system prompt at session
// start. Keeps the agent-browser / browser-verifier role split in the plugin
// itself, so consuming projects no longer need to copy CLAUDE.md to get it.
// Port is fixed to the default 9223 here (instructions can't be templated per
// project); non-default ports are handled via the env var noted below.
export const BROWSER_RULES = `Browser automation/verification splits across two tools — keep their roles separate.

## Tool Roles

Use \`agent-browser\` (Bash CLI) for:
- navigation, clicking, typing, hovering, scrolling, dragging
- file upload/download
- page exploration (\`snapshot\`, \`screenshot\`)
- session / auth / cookie management

Use \`browser-verifier\` (this MCP) for:
- validation (\`browser_verify\` — assertions)
- semantic state checks (\`browser_semantic_state\`, \`browser_inspect\`)
- console verification (\`browser_check_console\`)
- network verification (\`browser_check_network\`)
- verification sentinel (\`browser_sentinel_save\` — marks the current diff as verified so the Stop hook does not re-trigger)
- repeated verification workflows (\`browser_run_task\`)

## Decision Rules

Before starting ANY verification cycle — whether the user asked ("확인해줘" / "검증해줘" / "잘 됐는지 봐줘") or the Stop hook injected "[auto-verify]" — invoke the \`browser-verifier:verify\` skill via the Skill tool FIRST. The skill defines the cycle (tier selection, skip gate, sentinel, reporting format); do not run ad-hoc verification without it.

When the user asks whether something works → browser-verifier.
When the user asks to navigate, interact, or explore → agent-browser.

Do not manually inspect DOM via Read/Grep if browser-verifier can answer the question.

Prefer \`browser_run_task\` over ad-hoc steps for repeated validation workflows.

## Shared Browser

Both tools must point at the same CDP Chrome (default \`127.0.0.1:9223\`; override with \`BROWSER_VERIFIER_CDP_URL\`):

- \`agent-browser\` (operations) → attach with the plugin wrapper, NOT a bare \`--cdp\`:
  \`bash "\${CLAUDE_PLUGIN_ROOT}/scripts/agent-browser-attach.sh" <devPort> [cdpPort]\`, then drive with \`agent-browser --session browser-verifier <cmd>\`.
- \`browser-verifier\` (verification) → \`browser_setup({ port: <devPort>, cdpPort })\`; cdpPort defaults to 9223.

Why the wrapper (do NOT call \`agent-browser --cdp <port>\` directly): agent-browser reuses one shared \`default\` session — once it binds to a stray/spawned Chrome, later \`--cdp <port>\` is ignored and it drives the wrong browser. \`--cdp\` also targets the instance, not a tab (several app tabs in one CDP Chrome → wrong tab). The wrapper isolates a dedicated session and selects the tab by dev-server port. If agent-browser opens a new window instead of attaching → stale session; just re-run the wrapper (it scope-resets only its own session).

If Chrome is not running:
\`\`\`
/browser-verifier:launch-chrome <port>
\`\`\`

## Anti-patterns

- Using browser-verifier for clicks/fills/navigation (removed in v0.4.0 — verification-only)
- Using agent-browser for assertions or console/network verification
- Letting the two tools spawn separate browser instances (verification ≠ operation state)`;
//# sourceMappingURL=instructions.js.map
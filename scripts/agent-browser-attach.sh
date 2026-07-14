#!/usr/bin/env bash
# Attach agent-browser to the dev app tab inside the shared CDP Chrome.
#
# Why this exists:
#   - agent-browser reuses one shared "default" session. Once any command binds
#     that session to a browser (e.g. a stray spawn), later `--cdp <port>` calls
#     are IGNORED and reuse the stale binding — so agent-browser drives the wrong
#     (or a brand-new) Chrome instead of the shared CDP one. Using a dedicated
#     session avoids that collision.
#   - `--cdp <port>` targets the Chrome INSTANCE, not a tab. When several app
#     tabs live in one CDP Chrome (parallel worktrees: 3001/3002/3003), we must
#     also pick the tab whose URL is on the dev-server port.
#
# Usage:
#   ./scripts/agent-browser-attach.sh <devPort> [cdpPort]
#   ./scripts/agent-browser-attach.sh 3001          # cdp from $BROWSER_VERIFIER_CDP_URL or 9223
#   ./scripts/agent-browser-attach.sh 3001 9223
#
# After attaching, drive with:
#   agent-browser --session "$AGENT_BROWSER_SESSION" <command>
#
# Env:
#   BROWSER_VERIFIER_CDP_URL   cdp port fallback (e.g. http://127.0.0.1:9223)
#   AGENT_BROWSER_SESSION      dedicated session name (default: browser-verifier)

set -euo pipefail

DEV_PORT="${1:-}"
if [[ -z "$DEV_PORT" ]]; then
  echo "❌ usage: agent-browser-attach.sh <devPort> [cdpPort]" >&2
  exit 1
fi

CDP_PORT="${2:-}"
if [[ -z "$CDP_PORT" ]]; then
  if [[ -n "${BROWSER_VERIFIER_CDP_URL:-}" ]]; then
    CDP_PORT="$(echo "${BROWSER_VERIFIER_CDP_URL}" | sed -nE 's|.*:([0-9]+).*|\1|p')"
  else
    CDP_PORT=9223
  fi
fi
SESSION="${AGENT_BROWSER_SESSION:-browser-verifier}"

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "❌ agent-browser not found — install with: npm i -g agent-browser" >&2
  exit 1
fi

# 1. Reset any stale binding on OUR dedicated session so the next --cdp binds
#    cleanly. Scoped to this session — does NOT touch the user's default session
#    and does NOT kill the shared Chrome (verified: connectOverCDP close detaches).
agent-browser --session "$SESSION" close >/dev/null 2>&1 || true

# 2. Bind the session to the shared Chrome and enumerate its tabs.
tabs_json="$(agent-browser --session "$SESSION" --cdp "$CDP_PORT" tab list --json 2>/dev/null || true)"
if [[ -z "$tabs_json" ]]; then
  echo "❌ could not reach CDP Chrome on :${CDP_PORT} — launch it with: /browser-verifier:launch-chrome ${CDP_PORT}" >&2
  exit 1
fi

# 3. Pick the tab whose URL is on the dev-server port (not just the instance).
tab_id="$(printf '%s' "$tabs_json" | DEV_PORT="$DEV_PORT" python3 -c '
import sys, os, json
needle = ":" + os.environ["DEV_PORT"]
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tabs = (d.get("data") or {}).get("tabs", []) if isinstance(d, dict) else []
for t in tabs:
    if needle in str(t.get("url", "")):
        print(t.get("tabId") or "")
        break
')"

if [[ -z "$tab_id" ]]; then
  echo "❌ no tab on :${DEV_PORT} inside the :${CDP_PORT} Chrome — open http://localhost:${DEV_PORT} there first." >&2
  exit 1
fi

# 4. Focus that exact tab.
agent-browser --session "$SESSION" tab "$tab_id" >/dev/null 2>&1 || true

url="$(agent-browser --session "$SESSION" get url 2>/dev/null | tail -1)"
echo "✓ agent-browser session '${SESSION}' attached to ${url} (tab ${tab_id}, cdp :${CDP_PORT})"
echo "  drive with:  agent-browser --session ${SESSION} <command>"

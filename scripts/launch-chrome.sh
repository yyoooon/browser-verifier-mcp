#!/usr/bin/env bash
# Launch (or attach to) a dev Chrome with CDP debugging port.
#
# Usage:
#   ./scripts/launch-chrome.sh           # port from $BROWSER_VERIFIER_CDP_URL or 9223
#   ./scripts/launch-chrome.sh 9224
#
# Idempotent: if Chrome already listens on the port, this is a no-op.
# The user-data-dir lives at ~/.cache/browser-verifier/chrome-<port>
# (override with $BROWSER_VERIFIER_CHROME_USER_DATA_DIR).

set -euo pipefail

resolve_port() {
  if [[ -n "${1:-}" ]]; then
    echo "$1"
    return
  fi
  if [[ -n "${BROWSER_VERIFIER_CDP_URL:-}" ]]; then
    # http://127.0.0.1:9223 → 9223
    echo "${BROWSER_VERIFIER_CDP_URL}" | sed -nE 's|.*:([0-9]+).*|\1|p'
    return
  fi
  echo 9223
}

PORT="$(resolve_port "${1:-}")"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "❌ Invalid port: $PORT" >&2
  exit 1
fi

USER_DATA_DIR="${BROWSER_VERIFIER_CHROME_USER_DATA_DIR:-$HOME/.cache/browser-verifier/chrome-${PORT}}"
HEALTH_URL="http://127.0.0.1:${PORT}/json/version"

read_browser() {
  curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("Browser",""))' 2>/dev/null \
    || echo ""
}

# Already running?
if existing="$(read_browser)" && [[ -n "$existing" ]]; then
  echo "✓ Already running: ${existing} on :${PORT}"
  exit 0
fi

# Locate Chrome (macOS-first; allow override)
CHROME_APP="${GOOGLE_CHROME_APP:-/Applications/Google Chrome.app}"
if [[ ! -d "$CHROME_APP" ]]; then
  echo "❌ Google Chrome not found at $CHROME_APP" >&2
  echo "   Install Chrome or set \$GOOGLE_CHROME_APP." >&2
  exit 1
fi

mkdir -p "$USER_DATA_DIR"
echo "Launching Chrome on :${PORT}"
echo "  user-data-dir: ${USER_DATA_DIR}"

open -na "$CHROME_APP" --args \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${USER_DATA_DIR}" \
  --no-first-run \
  --no-default-browser-check

# Wait for CDP (up to ~10s)
for _ in $(seq 1 20); do
  if browser="$(read_browser)" && [[ -n "$browser" ]]; then
    echo "✓ Launched: ${browser} on :${PORT}"
    exit 0
  fi
  sleep 0.5
done

echo "❌ Chrome started but CDP not ready on :${PORT} after 10s" >&2
echo "   Check that another Chrome isn't blocking the user-data-dir lock:" >&2
echo "   pgrep -af 'remote-debugging-port' " >&2
exit 1

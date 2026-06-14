#!/usr/bin/env bash
# session-start-chrome-check.sh
# SessionStart hook: 페어링 셋업의 핵심인 dev Chrome (CDP)이
# 떠있는지 가볍게 진단. 떠있으면 침묵, 없으면 한 줄 안내만.
#
# 비용: curl 1콜 (localhost, 1초 timeout). Non-blocking — 항상 exit 0.
# 포트: $BROWSER_VERIFIER_CDP_URL > 9223 (기본)
#
# Opt-out: $HOME/.browser-verifier-no-session-check 가 있으면 즉시 종료.

set -eu

[ -f "$HOME/.browser-verifier-no-session-check" ] && exit 0

if [ -n "${BROWSER_VERIFIER_CDP_URL:-}" ]; then
  PORT=$(echo "${BROWSER_VERIFIER_CDP_URL}" | sed -nE 's|.*:([0-9]+).*|\1|p')
else
  PORT=9223
fi
[ -n "$PORT" ] || exit 0

if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  exit 0
fi

cat >&2 <<EOF
[browser-verifier] Chrome CDP가 :${PORT}에 없습니다.
페어링/검증을 시작하려면 \`/browser-verifier:launch-chrome\` 실행.
끄려면: touch ~/.browser-verifier-no-session-check
EOF
exit 0

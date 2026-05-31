#!/usr/bin/env bash
# Install git pre-commit hook for auto-build.
#
# Usage:
#   ./scripts/install-hooks.sh
#
# clone 후 한 번만 실행하면 됨. 이후 src/ 수정 + commit 시 자동으로
# npm run build 가 돌고 dist/ 가 같이 스테이지됨.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "❌ git 저장소 안에서 실행하세요." >&2
  exit 1
fi

HOOK_SOURCE="$REPO_ROOT/scripts/pre-commit"
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-commit"

if [[ ! -f "$HOOK_SOURCE" ]]; then
  echo "❌ scripts/pre-commit 이 없음." >&2
  exit 1
fi

# 기존 hook 있고 우리 symlink가 아니면 백업
if [[ -e "$HOOK_TARGET" ]] && [[ ! -L "$HOOK_TARGET" ]]; then
  BACKUP="$HOOK_TARGET.bak-$(date +%Y%m%d%H%M%S)"
  mv "$HOOK_TARGET" "$BACKUP"
  echo "기존 pre-commit 백업: $BACKUP"
fi

# scripts/pre-commit 을 가리키는 symlink (소스 수정 시 자동 반영)
ln -sf "../../scripts/pre-commit" "$HOOK_TARGET"
chmod +x "$HOOK_SOURCE"

echo "✅ pre-commit hook 설치됨"
echo "   .git/hooks/pre-commit -> scripts/pre-commit"
echo
echo "이제 src/ 수정 + git commit 시 자동으로 npm run build 가 돌고"
echo "dist/ 가 같이 스테이지됩니다. 우회: git commit --no-verify"

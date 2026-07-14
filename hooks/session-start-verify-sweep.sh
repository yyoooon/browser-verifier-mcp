#!/usr/bin/env bash
# session-start-verify-sweep.sh
# SessionStart hook: keeps the local, branch-scoped verification scratch tidy.
#   1. ensures `.browser-verifier/` is gitignored (so scratch is never committed)
#   2. removes `.browser-verifier/<branch-slug>/` folders whose git branch is gone
#      (merged/deleted) — the feature's scratch dies with its branch.
#
# Scope: ONLY runs when `.browser-verifier/` already exists in the project (so it
# never touches projects that don't use it). `_shared/` is always preserved.
# Non-blocking — always exit 0. Never touches committed files.
#
# Opt-out: touch ~/.browser-verifier-no-session-check

set -eu

[ -f "$HOME/.browser-verifier-no-session-check" ] && exit 0

# Project root: prefer Claude's env, fall back to git toplevel from cwd.
DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || exit 0                       # not a git repo → nothing to do

SCRATCH="$ROOT/.browser-verifier"
[ -d "$SCRATCH" ] || exit 0                     # project doesn't use scratch → skip

# 1) ensure gitignore entry (idempotent). Only touch .gitignore when scratch exists.
GI="$ROOT/.gitignore"
if ! { [ -f "$GI" ] && grep -qxF ".browser-verifier/" "$GI"; }; then
  printf '\n# browser-verifier local scratch (specs / tasks / checklists)\n.browser-verifier/\n' >> "$GI"
fi

# 2) sweep dead-branch folders.
# Live branch names, slugified the same way writers name folders ('/' → '-').
LIVE="$(git -C "$ROOT" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null | sed 's#/#-#g')"
[ -n "$LIVE" ] || exit 0                        # no branches / detached weirdness → don't risk deleting

for d in "$SCRATCH"/*/; do
  [ -d "$d" ] || continue                       # no subdirs → glob stayed literal
  name="$(basename "$d")"
  [ "$name" = "_shared" ] && continue           # shared helpers never swept
  if ! printf '%s\n' "$LIVE" | grep -qxF "$name"; then
    # defensive: path must be inside .browser-verifier before rm
    case "$d" in
      "$SCRATCH"/*) rm -rf "$d" && echo "[browser-verifier] swept scratch for deleted branch: $name" >&2 ;;
    esac
  fi
done

exit 0

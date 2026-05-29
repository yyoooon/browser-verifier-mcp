# Hooks (선택)

browser-verifier를 **자동 발동**시키는 Claude Code hook 3종. 수동 검증만 할 거면 없어도 된다 — Skill을 직접 invoke하면 됨.

3개가 하나의 시스템으로 맞물린다:

| 스크립트 | 이벤트 | 역할 |
|---|---|---|
| `browser-verify-gate.sh` | `Stop` | 코드 변경 감지 → `[auto-verify]` 프롬프트 주입으로 검증 사이클 트리거 |
| `skill-invoke-mark.sh` | `PostToolUse` (`Skill`) | browser-verifier 스킬 invoke 시 세션 marker 생성 |
| `browser-verifier-skill-gate.sh` | `PreToolUse` (`mcp__browser-verifier__.*`) | marker 없으면 도구 호출 차단 (스킬 경유 강제) |

> `skill-gate`는 `skill-invoke-mark`가 만든 marker에 의존한다. **둘은 항상 같이 설치**할 것 — gate만 넣으면 모든 browser-verifier 호출이 차단된다.

## 설치

1. 스크립트를 원하는 위치에 두고 실행권한 부여:

```bash
mkdir -p ~/.claude/scripts
cp hooks/*.sh ~/.claude/scripts/
chmod +x ~/.claude/scripts/*.sh
```

2. `~/.claude/settings.json`의 `hooks`에 배선:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/scripts/browser-verify-gate.sh" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "mcp__browser-verifier__.*",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/scripts/browser-verifier-skill-gate.sh", "timeout": 5 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/scripts/skill-invoke-mark.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

3. Claude Code 재시작.

## 커스터마이즈

- **검증 트리거 대상 경로** — `browser-verify-gate.sh`의 `case "$f" in ...` 화이트리스트 (`src/app`, `src/components`, `src/service`)를 소비 프로젝트 구조에 맞게 교체.
- **sentinel** — `.claude/.last-verified-hash`는 소비 프로젝트 루트에 생성되는 로컬 상태 파일. 커밋하지 말 것 (`.gitignore`에 `/.claude/`).

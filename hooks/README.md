# Hooks (선택 · opt-in)

코드 수정 직후 자동으로 browser-verifier 검증 사이클을 트리거하는 Stop hook 1종.

> **기본 비활성.** `BROWSER_VERIFIER_AUTO=1` 환경변수가 설정된 세션에서만 동작 — 설치만으로 자동 검증이 시작되지 않도록 가드를 둠.

수동 검증("이 페이지 검증해줘" 같이 매번 명시 요청)만 할 거면 hook은 필요 없다. Skill 자체는 `browser-verifier` MCP 서버 + skill 패키징(plugin install이 처리)으로 이미 발견·invoke 가능한 상태.

## 스크립트

| 스크립트 | 이벤트 | 역할 |
|---|---|---|
| `browser-verify-gate.sh` | `Stop` | git diff에 검증 대상 코드 변경이 있으면 `[auto-verify]` 프롬프트를 stderr로 주입해 검증 사이클을 시작시킨다. sentinel(`.claude/.last-verified-hash`)과 같은 hash면 무동작. |

## 설치 (수동 — plugin 외 방식)

1. 스크립트를 원하는 위치에 두고 실행권한 부여:

```bash
mkdir -p ~/.claude/scripts
cp hooks/browser-verify-gate.sh ~/.claude/scripts/
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
    ]
  }
}
```

3. 활성화하고 싶은 셸/세션에 환경변수:

```bash
export BROWSER_VERIFIER_AUTO=1
```

(영구 설정은 `~/.zshrc` / `~/.bashrc` 또는 Claude Code env 설정에 추가)

4. Claude Code 재시작.

## 동작

1. Claude가 응답을 끝낼 때마다(`Stop` event) 본 스크립트 호출
2. `BROWSER_VERIFIER_AUTO=1` 미설정이면 즉시 no-op 종료
3. 설정돼 있으면 git diff + untracked 합쳐서 sha256 해시 계산
4. 직전 검증 완료 마커(`.claude/.last-verified-hash`)와 비교 → 동일하면 무동작
5. 검증 대상 경로(`src/app`, `src/components`, `src/service`) 변경이 없으면 sentinel 갱신 후 종료
6. 있으면 stderr로 `[auto-verify]` 프롬프트 주입 + exit 2 → Claude가 다시 발동되어 browser-verifier skill을 invoke

## 커스터마이즈

- **검증 트리거 대상 경로** — `browser-verify-gate.sh`의 `case "$f" in ...` 화이트리스트를 소비 프로젝트 구조에 맞게 교체.
- **Ephemeral 파일 패턴** — `.log`, `.pid`, `.env*`, `.DS_Store` 등 검증 트리거 대상에서 제외할 패턴.
- **sentinel 위치** — `$PROJECT_ROOT/.claude/.last-verified-hash`. 커밋하지 말 것 (`.gitignore`에 `/.claude/`).

## Plugin 사용자에게는

`browser-verifier` Claude Code plugin을 install했다면 이 hook이 자동으로 wiring되어 있다. 활성화하려면 `BROWSER_VERIFIER_AUTO=1`만 셸 env에 추가하면 끝.

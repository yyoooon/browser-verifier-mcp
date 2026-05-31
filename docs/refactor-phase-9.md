# Phase 9 — Plugin Distribution

리팩터 9단계. Claude Code plugin 포맷으로 패키징해서 **두 줄 install**로 사용 가능하게 만듦. 부수적으로 hook 단순화, CI 자동화, README 친절화, multi-port 지원, dead code 청소.

## 배경

Phase 8까지는 "이 repo를 가진 사람이 직접 wiring하는" 모델이었음:

1. `git clone` + `npm install` + `npm run build`
2. `~/.claude.json`의 `mcpServers`에 entry 직접 추가
3. `~/.claude/skills/`에 skill 심볼릭 링크
4. `~/.claude/settings.json`의 `hooks`에 hook 배선
5. Claude Code 재시작

→ 파편화된 4단계. 사용자가 어느 한 단계라도 빼먹으면 동작 안 함 ("MCP 도구는 보이는데 skill 자동 발동 안 됨" 같은 증상).

Phase 9는 이 4단계를 **`/plugin install` 한 줄**로 줄임.

## 결정

### A. Plugin 포맷으로 통합
Claude Code plugin은 MCP server + skills + agents + slash commands + hooks를 하나의 manifest로 묶어서 배포 가능. install/uninstall 시 모두 자동 wiring.

### B. Auto-trigger를 opt-in으로
이전엔 hook 3종이 `skill-invoke 강제` + `Stop event trigger`를 같이 했음. Plugin install이 skill 발견을 자동으로 처리하므로 **enforcement(A)는 불필요**. Stop trigger(B)만 남기고 **default off** (sentinel 파일 가드).

### C. Slash command로 토글
opt-in을 env var 대신 `~/.browser-verifier-auto` 파일로 바꾸고, plugin이 `/browser-verifier:enable-auto` / `disable-auto` 슬래시 명령을 제공해서 한 줄로 토글.

## 변경 사항

### 9-A. Hook 단순화 (commits `7b83e2e`, `1d2391e`)

| 변경 | 이유 |
|---|---|
| `skill-invoke-mark.sh` 삭제 | (A) skill 강제용 marker — plugin이 skill 자동 등록하므로 불필요 |
| `browser-verifier-skill-gate.sh` 삭제 | (A) MCP 호출 차단 게이트 — 같음 |
| `browser-verify-gate.sh` 가드 변경 | `BROWSER_VERIFIER_AUTO=1` env → `[ -f "$HOME/.browser-verifier-auto" ]` 파일 체크 |
| `commands/enable-auto.md`, `commands/disable-auto.md` 신규 | `/browser-verifier:enable-auto` / `disable-auto`로 sentinel 파일 토글 |
| `hooks/README.md` 재작성 | env var 안내 제거, plugin / manual 두 경로 모두 명시 |

### 9-B. Plugin 패키징 (commit `1964eb6`)

신규 파일:
- `.claude-plugin/plugin.json` — manifest (name=browser-verifier, MIT)
- `.claude-plugin/marketplace.json` — marketplace catalog (name=yyoooon)
- `.mcp.json` — `${CLAUDE_PLUGIN_ROOT}/dist/server.js` 자동 등록
- `hooks/hooks.json` — Stop event에 browser-verify-gate.sh 자동 wiring

구조 변경:
- `skills/SKILL.md` → `skills/verify/SKILL.md` (plugin convention: `skills/<skill-name>/SKILL.md` → 호출 시 `/browser-verifier:verify`)
- `skills/references/` → `skills/verify/references/` (같이 이동)
- `.gitignore`에서 `dist/` 제거, `dist/` commit 시작 (plugin install이 build를 안 돌리므로)

README:
- "설치 — Claude Code Plugin (권장)" 섹션 신설 (2줄 install)
- "설치 — Manual" 섹션 보존 (fallback)
- skill 경로 참조 업데이트

설치 UX:
```
/plugin marketplace add yyoooon/browser-verifier-mcp
/plugin install browser-verifier@yyoooon
# 자동 검증 켜기 (선택)
/browser-verifier:enable-auto
```

### 9-C. CI / 자동화 (commit `855918e`)

`dist/`를 commit한 이상 src와 동기화 유지가 critical. **두 단계 자동화**:

- `scripts/pre-commit` — bash hook. src/ staged 시 `rm -rf dist + npm run build + git add dist/`. build 실패 시 commit abort
- `scripts/install-hooks.sh` — `.git/hooks/pre-commit -> scripts/pre-commit` symlink installer (clone 후 1회 실행)
- `.github/workflows/build-check.yml` — push/PR마다 clean rebuild 후 `git diff --exit-code dist/`. 어긋나면 fail (pre-commit 우회 / 다른 머신 commit 잡아냄)
- `CONTRIBUTING.md` — maintainer용 가이드 (hook setup, multi-machine 안내)

### 9-D. Plugin manifest 버그 fix (commit `5408f0b`)

설치 시 Claude Code validator가 reject:
```
repository: Invalid input: expected string, received object
```

npm style 객체 `{ type, url }`을 plain URL string으로 교체.

### 9-E. README 친절화 (commit `1e7a74a`)

기존 "왜 쓰나"는 LLM/CDP 이해 있는 사람만 이해할 수 있는 기술 모티베이션. 1회 사용자가 README 1분 안에 "이게 나한테 맞나"를 판단할 수 있게 재구조화:

- **한 줄 정의** — "Claude한테 너의 브라우저를 보는 눈을 달아주는 플러그인"
- **어떤 문제를 푸는가** — 수동 검증 루프 + Before/After 예시
- **잘 쓰는 시나리오** — Figma→Tailwind / 다단계 인터랙션 / 회귀 / task 4가지 구체 케이스
- **누구한테 잘 맞나** — 잘 맞는 사람 / 별로 안 맞는 사람
- **내부 동작 (관심 있으면)** — 기존 기술 bullet들을 마지막으로 이동, `docs/concepts.md` cross-link

### 9-F. cdpPort 인자 (commit `2a5a9c6`)

이전: Chrome remote-debugging port 변경은 `BROWSER_VERIFIER_CDP_URL` env var만. plugin 사용자에겐 셸 설정 어색.

추가: `browser_setup({ port, cdpPort? })` per-call override.

3-level fallback:
1. `cdpPort` 명시 → `http://127.0.0.1:<cdpPort>`
2. `BROWSER_VERIFIER_CDP_URL` env var → 그 URL (Docker/WSL escape)
3. default → `http://127.0.0.1:9223`

변경 파일:
- `src/runtime/client.ts` — `attach(port, cdpUrl?)`. `RuntimeState`에 `cdpUrl` 추가하여 `ensureAttached` 재접속 시 동일 Chrome 보장
- `src/cdp/target.ts` — `listTargets/findTargetByPort`에 optional `cdpUrl`
- `src/tools/setup.ts` — `cdpPort` MCP schema + description에 두 포트의 의미 명시
- `src/tools/tabs.ts` — `listTargets`가 현재 세션의 `cdpUrl` 사용 (일관성)

### 9-G. Dead code 청소 (commit `d8615a7`)

YAGNI sweep. 3 symbol 제거:

- `src/cdp/actions.ts:activateTab()` — Phase 6 surface narrowing 때 같이 빠졌어야 했던 legacy
- `src/runtime/tasks/registry.ts:clearTasks()` — 테스트도 reload flow도 없음
- `src/runtime/navigation/waitRouteChange.ts` 파일 전체 — Phase 1 plan에 있었지만 `waitForUrl`로 갈음됨

## 검증

설치 라운드트립:
- `/plugin marketplace add yyoooon/browser-verifier-mcp` — marketplace 등록 OK
- `/plugin install browser-verifier@yyoooon` — 1차에 `repository` 타입 reject (9-D로 fix). 재시도 PASS.
- Plugin Manager UI에서 `browser-verifier` 0.1.0 노출 확인.

Pre-commit hook 동작:
- src/ 변경 commit 시 자동 `rm -rf dist + npm run build + git add dist/` (commit `2a5a9c6`에서 "modified: 11" 메시지 확인)
- src 무변동 commit 시 silent skip (commit `855918e`)

GitHub Action `build-check`:
- 매 push/PR에서 clean rebuild 후 dist diff 확인. dist 불일치 시 fail + 안내 메시지.

Dead-code sweep:
- Explore agent로 src/ 도달 가능성 + cross-file unused export + 고아 파일 / 빈 파일 / 중복 로직 모두 검사. 9-G에서 3건 제거 후 0건.

## 의도적으로 안 한 것

- **자동 Chrome launch** (`browser_setup`이 Chrome 없으면 직접 띄움) — Chrome 경로 OS별 처리, 라이프사이클 관리 복잡. 사용자가 의도적으로 dev 모드 Chrome 선택하는 게 안전. `chrome-debug` alias로 충분.
- **husky / npm-managed hooks** — 솔로 프로젝트라 raw `.git/hooks/` + installer로 충분. 협업자 늘면 그때.
- **Anthropic 커뮤니티 marketplace 등록** — Level A로 시작. 안정화 후 신청.

## Phase 9 종료 상태

| 영역 | 결과 |
|---|---|
| 배포 채널 | Claude Code plugin (자체 marketplace) + manual fallback |
| 설치 UX | 2-line plugin install |
| Auto-verify | opt-in slash command 1줄 |
| dist/ 동기화 | pre-commit + CI 이중 안전망 |
| Chrome 포트 | per-call cdpPort + env var fallback |
| 코드 군더더기 | 0 (dead-code sweep 통과) |
| 사용자 문서 | README 1회 사용자 친화, manual install 보존, CONTRIBUTING 신규 |

리팩터 phase 1~9 모두 종료. 다음은 사용자 피드백 → 후속 작업 (Anthropic marketplace 신청, 자동 Chrome launch 같은 polish, 또는 새 기능).

# Browser-Verifier MCP — CDP-Direct Rewrite

**Date:** 2026-05-22
**Version:** 0.0.1 → 0.1.0
**Goal:** 검증 사이클을 더 빠르고 정확하게 만들기.

---

## 한 줄 요약

`agent-browser` CLI wrapper 구조 폐기. MCP 서버가 **chrome-remote-interface로 Chrome 9223에 영구 attach**하는 구조로 전면 리라이트. 호출당 오버헤드 ~50-100배 감축.

---

## 문제 정의 (Before)

옛 MCP는 모든 툴이 `agent-browser` CLI를 자식 프로세스로 spawn하는 wrapper.

```
[Claude] → [MCP 툴 호출] → execa("agent-browser", [...]) → [agent-browser CLI]
                                                                ↓
                                                          [CDP attach → 명령 → detach]
                                                                ↓
                                                          [Chrome 9223]
```

매 호출마다:
1. Node 자식 프로세스 spawn (~200ms)
2. agent-browser → Chrome WebSocket 새 연결 (~100ms)
3. 명령 실행 (~10ms)
4. WebSocket 끊고 프로세스 종료

**호출당 ~300-500ms 고정 오버헤드.**

추가 문제:
- 탭 관리(`tab list`/`tab switch`)가 MCP 미지원 → Bash로 갈라짐 → 컨텍스트 스위칭
- Console/Network 버퍼는 매 호출마다 새 child process라 누적 유지 불가 → 매번 `--clear` 후 다시 attach
- SKILL.md가 30줄 인덱스만, 본문은 `protocol.md`(260줄) + `cli.md`(260줄)에 분산 → auto-load 시 본문 누락 → 핵심 룰 빠뜨리는 버그

---

## 새 구조 (After)

```
[Claude] → [MCP 툴 호출] → [chrome-remote-interface, 영구 WebSocket] → [Chrome 9223]
```

MCP 서버 in-memory 상태:
- CDP WebSocket 1개 (lazy attach, disconnect 시 자동 재연결)
- Console buffer (Runtime.consoleAPICalled + exceptionThrown 이벤트 누적)
- Network buffer (requestWillBeSent + responseReceived + loadingFailed 누적)

**호출당 비용:**
- `browser_setup` (최초 1회) — 30ms (Chrome attach + Domain.enable + 버퍼 prime)
- 이후 모든 툴 호출 — 1-5ms (이미 열린 소켓에 메시지만)

---

## 성능 비교 (실측)

| 호출 | Before (CLI wrapper) | After (CDP-direct) |
|---|---|---|
| `tab_list` | ~300ms | **6ms** |
| `setup` (최초 attach) | n/a | **30ms** |
| `eval` (단일) | ~300-500ms | **5ms** |
| `batch` (3 ops) | ~900ms | **3ms** |
| `check_console` | ~200ms | **0-1ms** (in-memory 읽기) |
| `check_network` | ~200ms | **1ms** |

**검증 사이클 5콜 합산:** ~1.5-2.5초 → **~50ms.** 약 50배 단축.

토큰 측면도 개선 — child process 출력의 비공식 텍스트 → 구조화된 JSON 응답.

---

## 변경 사항

### 1. 의존성 변경

`package.json`:
- ❌ `agent-browser` 제거
- ❌ `execa` 제거 (CLI spawn에만 쓰임)
- ✅ `chrome-remote-interface` 추가
- ✅ `@types/chrome-remote-interface`, `@types/node` (devDeps)

### 2. 소스 구조 재편

**신설:**
- `src/cdp/client.ts` — 영구 CDP 세션 관리, attach/재연결 로직
- `src/cdp/target.ts` — `/json/list`로 PORT → target 매칭
- `src/cdp/port.ts` — `.env.local` → lsof → 3000 fallback
- `src/cdp/buffers.ts` — Runtime/Network 이벤트 → 메모리 버퍼
- `src/cdp/eval.ts` — Runtime.evaluate 래퍼 (returnByValue + awaitPromise)
- `src/cdp/wait.ts` — URL / text / selector / load state 폴링
- `src/cdp/actions.ts` — click / fill / navigate / reload 헬퍼
- `src/lib/glob.ts` — URL glob → regex
- `src/lib/result.ts` — `ok/fail` 응답 직렬화

**리라이트:**
- `src/tools/*` — 11개 → 19개 (전부 CDP 직결로 재작성)
- `src/server.ts` — 새 dispatch

**제거:**
- `src/core/*` — agent-browser CLI wrapper
- `src/actions/*`, `src/checks/*`, `src/react/*` — 작은 CLI helper들
- `src/types/*`, `src/verification/*` — 미사용 legacy
- `src/index.ts` — 사용 안 함

### 3. MCP 툴 목록 (11 → 19)

| 카테고리 | 툴 | Before | After |
|---|---|---|---|
| Setup | `browser_setup` | ❌ | ✅ NEW |
| Eval | `browser_eval` | ✅ | ✅ (CDP 직접) |
| Batch | `browser_batch` | ✅ (CLI string) | ✅ (구조화 ops) |
| Wait | `browser_wait_url` | ✅ | ✅ |
| Wait | `browser_wait_text` | ✅ | ✅ |
| Wait | `browser_wait_selector` | ❌ | ✅ NEW |
| Wait | `browser_wait_load` | ❌ | ✅ NEW |
| Action | `browser_click` | ✅ | ✅ |
| Action | `browser_navigate` | ✅ | ✅ |
| Action | `browser_fill_input` | ✅ | ✅ |
| Action | `browser_goto` | ❌ | ✅ NEW |
| Action | `browser_reload` | ❌ | ✅ NEW |
| Check | `browser_check_console` | ✅ | ✅ (필터 + drain) |
| Check | `browser_check_network` | ✅ | ✅ (status 필터) |
| Check | `browser_get_url` | ✅ | ✅ |
| Check | `browser_is_visible` | ✅ | ✅ |
| Util | `browser_tab_list` | ❌ | ✅ NEW |
| Util | `browser_screenshot` | ❌ | ✅ NEW |
| Util | `browser_sentinel_save` | ❌ | ✅ NEW |

### 4. 탭 매칭 — 메모리 캐시 의존 제거

옛 구조: `~/.claude/projects/.../memory/reference_webview_chrome_tabs.md`에 worktree → tab ID 매핑 수동 기록.
- spawn.sh가 채워줌
- Chrome 재시작 시 stale
- 사용자가 만든 탭은 미등록

새 구조: **CDP `/json/list`로 매번 정확 매칭.**
- `http(s)://(localhost|127.0.0.1):<port>/` 정규식
- 6ms 안에 끝남 → 캐시 불필요
- 자기 치유 (탭 닫혀도 다음 호출에서 재발견)

### 5. SKILL.md 구조 재편

**Before:**
- `SKILL.md` (30줄, 인덱스만)
- `protocol.md` (260줄)
- `cli.md` (260줄)

→ auto-load는 `SKILL.md`만 → 본문 누락 → 핵심 룰 빠뜨림.

**After:**
- `SKILL.md` (220줄, 핵심 인라인)
  - 7 Rules
  - 19개 툴 표 + BatchOp 스펙
  - Standard Cycle + 도구 결정표
  - Plan announcement (안 묻고 실행)
  - Wiring-Only Skip Gate (3조건 + 예시)
  - Tier / Category Selection 요약
  - Reporting Tone "체크: ..." 예시
  - Infra Error Table
  - Subagent Dispatch 요약
- `references/` (lazy load)
  - `tier-selection.md` (47줄) — page-scoped 글로브 + 알고리즘
  - `category-selection.md` (60줄) — diff → cat 매핑표
  - `full-path-brief.md` (102줄) — Subagent Brief + Fix Loop
  - `token-check.md` (63줄) — classList → computed rgba 폴백

**Auto-load 토큰 비교:**

| | 자동 로드 |
|---|---|
| 옛 (browser-verification + agent-browser 합산) | ~20k tokens |
| 새 SKILL.md만 | ~4.5k tokens |
| references/ | lazy (필요 시) |

→ **80% 감축**, 정확도 유지.

### 6. Sentinel 자동화

기존: 스킬 본문이 sha256 계산 Bash 블록을 매번 실행하도록 안내. 누락 시 Stop hook 무한 루프.

신규: `browser_sentinel_save` MCP 툴 — Node crypto.createHash로 자동 계산 + `.claude/.last-verified-hash` 자동 기록. Ephemeral 파일 (`.log`/`.pid`/`.env*`/`.DS_Store`) 자동 제외.

### 7. 콘솔/네트워크 노이즈 필터

서버 사이드 자동 필터 (정규식):
- `CareHubBridge` (Care Hub WebView bridge 로그)
- `[HMR]`, `[Fast Refresh]` (Next.js dev)
- `webpack-internal`, `react-devtools`
- `Lighthouse`

`includeNoise: true` 패스해야 raw 보임. 옛 구조에선 매 콜마다 jq로 grep 필요했음.

---

## agent-browser CLI는 이제 언제?

MCP 자체에선 호출 X. 다음 경우만 사용자가 Bash에서 직접:

1. Chrome 9223 인스턴스 launching
2. MCP 미응답 시 manual fallback / 진단
3. MCP에 미구현 기능 — network mocking (`--body`/`--abort`), 뷰포트 조작
4. 인터랙티브 단발 탐색

자동화 검증 사이클 안에서는 등장 없음.

---

## 적용 방법

**Claude 재시작 필요.** MCP 서버는 Claude 세션 시작 시 spawn되므로, 현 세션에는 옛 코드가 로드돼 있음.

```
1. claude 종료
2. claude 재진입
3. 새 dist/server.js 자동 로드
```

확인:
```bash
claude mcp list | grep browser-verifier
# → browser-verifier: node /Users/yoon/Desktop/HURAY/browser-verifier-mcp/dist/server.js - ✓ Connected
```

검증할 때:
```
1. browser_setup({ port: 3000 })  ← 한 번
2. browser_eval / browser_batch / browser_navigate 등 마음껏 호출
3. browser_check_console + browser_check_network
4. browser_sentinel_save()  ← 마지막에 한 번
```

---

## 비고

- 옵션 B (network mocking)는 의도적으로 스킵 — 사용 빈도 < 5%, `Fetch.requestPaused` 구현 복잡. 필요해지면 별도 PR.
- TypeScript strict 통과, `npx tsc --noEmit` clean.
- 스모크 테스트: localhost:3002 (Care Hub dev) 기준 19개 툴 모두 정상 동작.

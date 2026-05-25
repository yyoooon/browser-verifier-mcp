---
name: browser-verifier
description: Auto-invoke when Stop hook injects "[auto-verify]", or when user explicitly requests verification of behavior/interactions/console-errors after code changes. NOT for pixel-perfect visual diffing. Also use when user mentions agent-browser/9223 or asks for browser automation.
---

# Browser Verifier (CDP-direct MCP)

Persistent CDP attachment via Chrome 9223. One WebSocket session per verification cycle, no per-call agent-browser spawn.

## The 7 Rules (memorize)

1. **`browser_setup` FIRST** — once per cycle. Auto-detects PORT from `.env.local`/lsof. Skip → all tools fail "not attached".
2. **MCP tools, not `agent-browser` CLI** — every old CLI flow is covered by an MCP tool.
3. **Navigation = `browser_batch`/`browser_navigate`, NOT `browser_eval`** — IIFE in `browser_eval` cannot survive page navigation (CDP context invalidates → re-try turn 폭주).
4. **`browser_click` / `browser_navigate` auto-wait for React hydration** — fiber 붙을 때까지 최대 3s 자동 대기. Next.js dev에서 `networkidle`은 HMR 때문에 못 씀, 대신 `wait_load: "hydrated"` 사용.
5. **React inputs = `browser_fill_input`** — uses native setter + dispatchEvent.
6. **`browser_check_console` filters noise** — CareHubBridge / HMR / Fast Refresh / 다른 워크트리 포트 자동 제거.
7. **End with `browser_sentinel_save`** — writes `.claude/.last-verified-hash`, stops Stop hook re-trigger.
8. **No pixel-perfect diffing** — token check OK (classList / computed rgba), 1-2px 비교 X.

---

## Tools

| Tool | Purpose |
|---|---|
| `browser_setup({ port? })` | Attach to localhost:port target, prime buffers. ONCE per cycle. |
| `browser_eval({ script, timeoutMs? })` | Same-page JS eval. Returns `{ value }`. |
| `browser_batch({ ops })` | Sequential ops across navigation. Stops on first failure. |
| `browser_click({ text })` | Click by visible text or aria-label. |
| `browser_navigate({ clickText, expectedUrl })` | Click then wait for URL match. |
| `browser_goto({ url })` | Full-page `Page.navigate`. |
| `browser_reload()` | `Page.reload`. |
| `browser_fill_input({ selector, value })` | React-safe input fill. |
| `browser_wait_url({ pattern, timeoutMs? })` | Poll location.href until glob matches. |
| `browser_wait_text({ text })` | Poll body.innerText for substring. |
| `browser_wait_selector({ selector })` | Poll until selector exists. |
| `browser_wait_load({ state })` | `load` / `domcontentloaded` / `networkidle`. |
| `browser_check_console({ level?, clear?, includeNoise? })` | Drain console buffer. |
| `browser_check_network({ status?, urlContains?, clear? })` | Drain network buffer (default: errors). |
| `browser_get_url()` | Current location.href. |
| `browser_is_visible({ selector })` | DOM + non-zero rect + computed style check. |
| `browser_screenshot({ name?, fullPage?, format?, quality? })` | JPEG@70 default → `/tmp/<name>.jpeg`. cat 1-a only. |
| `browser_tab_list()` | List all page targets (CDP /json/list). |
| `browser_sentinel_save({ projectRoot? })` | Write diff hash → stops Stop-hook loop. |

### BatchOp shapes

```ts
{ op: "click", text }
{ op: "navigate", clickText, expectedUrl, timeoutMs? }
{ op: "fill", selector, value }
{ op: "goto", url, timeoutMs? }
{ op: "reload" }
{ op: "eval", script, timeoutMs? }
{ op: "wait_url", pattern, timeoutMs? }
{ op: "wait_text", text, timeoutMs? }
{ op: "wait_selector", selector, timeoutMs? }
{ op: "wait_load", state?: "load"|"domcontentloaded"|"networkidle" }
{ op: "get_url" }
```

---

## Standard Cycle (Light Path)

Target: 4-6 MCP calls, < 10s wall time.

1. `browser_setup({ port })` — port from worktree's `.env.local`, or omit for auto-detect.
2. **Read 컴포넌트 코드 먼저** — DOM 구조 / selector / data-attribute 파악 후 한 콜로 작성. eval로 탐색 금지.
3. `browser_eval` / `browser_batch` / `browser_navigate` — Category에 맞는 도구 (아래 결정표).
4. `browser_check_console({ level: "error", clear: true })`.
5. `browser_check_network({ status: "errors" })` — API 변경 시.
6. `browser_sentinel_save()` — PASS 또는 wiring-only SKIP일 때만.

### 도구 결정표

| 변경 성격 | 도구 |
|---|---|
| Navigation (click → URL 변경) | `browser_navigate` 또는 `browser_batch` `{click, wait_url, get_url}` |
| 같은 페이지 단일 인스펙션 | `browser_eval` (IIFE 1콜) |
| 같은 페이지 sub-view 전환 (click → 리렌더) | `browser_batch` `{eval, wait_selector, eval}` |
| State 변경 → reload → 검증 | `browser_batch` `{eval, reload, wait_load, eval}` |
| 폼 입력 → submit → 페이지 전환 | `browser_fill_input` + `browser_batch` `{click, wait_url, wait_text}` |

---

## Plan announcement (no approval)

Tier + Category 결정 직후 **승인 받지 말고 즉시 실행**. 한 줄로 알림만:

```
Light path 진입 (5-10초 예상) — /record에서 차트 attribute + console 에러 체크
```

금지: "진행할까요?" / "검증 계획: ..." 같은 승인 대기. eval을 먼저 날리고 결과만 보고.

예외 — Wiring-Only SKIP / 코드 변경 없음은 알림 자체도 생략.

---

## Wiring-Only Skip Gate (3조건 모두 충족 → silent SKIP)

1. **wiring 단순** — signature 변경 없는 prop 추가/교체, 문자열 상수 수정, className/variant 값 교체. 새 로직/조건부 렌더 없음.
2. **동일 패턴이 코드베이스 다른 곳에서 이미 동작 중** — 처음 등장하는 패턴이면 SKIP X.
3. **잘못되면 사용자가 1클릭으로 즉시 catch 가능** — UI에 노출된 인터랙션.

### SKIP 예시
- 기존 컴포넌트에 `onClick` prop 추가 (다른 페이지에서 동작 검증된 패턴)
- `router.push('/A')` → `router.push('/B')` 인자 교체
- `variant="default"` → `variant="ghost"` 같은 prop 값 교체
- Tailwind class 문자열 교체

### SKIP 안 함
- 핸들러 내부 로직 변경 (toast, mutation, 상태 전환)
- 새 컴포넌트 mount / 조건부 렌더 추가
- 같은 패턴이 코드베이스에 처음 등장

→ 통과 시 `browser_sentinel_save()` 호출 후 silent 종료. 사용자 채팅 출력 X.

---

## Tier Selection (Light vs Full)

| Path | When | Calls | Target |
|---|---|---|---|
| **Light** | page-scoped 변경만, < 80줄 | 4-6 MCP 직접 | < 10s |
| **Full** | 라우팅/middleware/service/api 변경, > 80줄, 또는 Fix Loop 2회차 | Subagent (haiku) | < 60s |

**Page-scoped = Light:** `src/app/<route>/_components/`, `_lib/`, `_mock/`, `_store/`.
**Global = Full:** `src/lib/`, `src/service/`, `src/middleware.ts`, `route.ts`, 새 `page.tsx`.

상세 알고리즘 / red flag → `references/tier-selection.md`.

---

## Category Selection (무엇을 검증할지)

diff 패턴으로 cat set 결정. cat 4(console + network)는 항상 디폴트 포함.

| 변경 | cat |
|---|---|
| Tailwind / tokens.css / 색 변경 | 1-a + 1-b |
| 새 JSX mount / 조건부 렌더 | 1-a |
| 새 `onClick` / nav 트리거 | 2 |
| 폼/모달/다단계 | 3 |
| API/mutation/fetch | 4 |
| useEffect 초기 fetch | 4 + 1-a |
| Figma 토큰 적용 | 1-b → `references/token-check.md` |

상세 매핑표 / 실행 압축 → `references/category-selection.md`.

---

## Reporting Tone

매 보고에 elapsed `(Xs)` 포함. PASS 보고에 **"체크: ..."로 무엇을 확인했는지 요약**.

길이 룰:
- 항목 3개 이내 → 한 줄에 ` / `로 구분
- 4개 이상 또는 80자 초과 → bullet (최대 5개)

```
✅ PASS — 검증 통과 (8.4s) — light path
   체크: dropdown 라벨/태그 9개 / 토큰(bg-blue-weak, text-primary) / console 에러

🔧 PASS after fix — 1차 실패 → 수정 후 통과 (52s)
   수정: handleSubmit에서 saveToken 누락 → 추가

⏭️ SKIP (인프라) — 검증 스킵: dev 서버 미기동 (yarn dev 후 재시도)

❌ ESCALATION — 발견 문제 / 시도 2건 요약 / 추측 root cause. 코드는 마지막 수정 유지.
```

Silent SKIP (wiring-only) → 사용자 채팅 출력 X.

---

## Infra Error Table

| 케이스 | 동작 |
|---|---|
| Dev 서버 미기동 (PORT LISTEN 없음) | 메시지 + sentinel + 종료. 수정 루프 진입 X. |
| Chrome 9223 미기동 / 매칭 탭 없음 | "검증용 Chrome 9223으로 :PORT 탭 열어주세요" + sentinel + 종료. **자체 spawn 금지.** |
| Auth 토큰 없음 / 보호 라우트 | SKIP + 사유 알림 |
| Diff > 300줄 / 광범위 리팩터 | SKIP + "manual review recommended" |

---

## Subagent Dispatch (Full Path)

`Agent` 툴로 `general-purpose` 서브에이전트. 모델 디폴트 **`haiku`** (Opus 대비 2-3배 빠름).

올리는 케이스: Fix Loop 2회차 / diff > 50줄 + 여러 파일 / Haiku confidence: low.

전체 Brief 템플릿 / Fix Loop 흐름 → `references/full-path-brief.md`.

---

## Workflow Summary

```
1. Auto-verify 시그널 / 사용자 요청
2. 코드 변경 없음 → silent sentinel + 종료
3. Wiring-Only Skip Gate → silent sentinel + 종료
4. Tier + Category 결정 → 1줄 알림
5. Light: 메인 직접 4-6 MCP 콜 (< 10s)
   Full: 서브에이전트 dispatch (haiku, < 60s)
6. PASS → "체크: ..." 보고 + sentinel
   FAIL → 사유 보고
   Fix Loop: systematic-debugging → 수정 → 재검증 (최대 2회) → 막히면 에스컬레이션
```

---

## References (lazy load)

- `references/tier-selection.md` — page-scoped 글로브 + 알고리즘 + red flag
- `references/category-selection.md` — diff → cat 매핑 + 실행 압축
- `references/full-path-brief.md` — subagent Brief 템플릿 + Fix Loop
- `references/token-check.md` — classList → computed rgba 폴백

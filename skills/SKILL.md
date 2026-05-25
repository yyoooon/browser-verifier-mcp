---
name: browser-verifier
description: Auto-invoke when Stop hook injects "[auto-verify]", or when user explicitly requests verification of behavior/interactions/console-errors after code changes. NOT for pixel-perfect visual diffing.
---

# Browser Verifier (Playwright + Task Runtime)

Deterministic verification on top of Chrome 9223 via Playwright `connectOverCDP`. One Browser session per cycle. **LLM decides WHAT to verify; runtime decides HOW** — interaction stability (hydration, retry, route stabilization) is baked into the runtime, not prompted.

## The 5 Rules (memorize)

1. **`browser_setup` FIRST** — once per cycle. Auto-detects PORT from `.env.local`/lsof. Skip → all other tools fail "not attached".
2. **Repeated flows = tasks; one-off = primitives** — login, modal-open, checkout 같은 반복 시나리오는 `tasks.json`에 정의 + `browser_run_task`. 일회성 검증은 `browser_semantic_state` + `browser_verify`. **새 반복 flow는 lazy creation** — `.browser-verifier/tasks.json`이 없으면 LLM이 자동 생성 (디렉토리 포함), 있으면 task 추가 후 `browser_load_tasks` 리로드.
3. **`browser_verify` > 여러 `browser_eval`** — assertion-style 검증은 verify의 check 배열 한 콜로. eval은 verify로 표현 불가능한 ad-hoc 인스펙션에만.
4. **`browser_check_console`은 자동 노이즈 필터** — CareHubBridge / HMR / Fast Refresh / 다른 워크트리 포트 제거됨.
5. **`browser_sentinel_save`로 마무리** — PASS 또는 wiring-only SKIP 시 `.claude/.last-verified-hash` 기록 → Stop hook re-trigger 차단.

**No pixel-perfect diffing** — token 매칭(classList / computed rgba)은 OK, 1-2px 비교는 영역 밖.

---

## Tools (14)

### Lifecycle
| Tool | Purpose |
|---|---|
| `browser_setup({ port? })` | Attach to localhost:port via Playwright connectOverCDP. ONCE per cycle. |
| `browser_tab_list()` | List all page targets in Chrome 9223. |
| `browser_sentinel_save({ projectRoot? })` | Write diff hash → stops Stop-hook loop. End-of-cycle. |

### Inspection (구조화)
| Tool | Purpose |
|---|---|
| `browser_semantic_state()` | One-shot compact state: route, title, loading, modal, primaryCTA, headings, errors, inputCount, focusedElement. Prefer this over raw DOM dumps. |
| `browser_get_url()` | Current `location.href`. |
| `browser_is_visible({ selector })` | DOM + non-zero rect + computed style for a specific selector. |

### Verification
| Tool | Purpose |
|---|---|
| `browser_verify({ checks })` | Batch generic assertions on one snapshot + one batched DOM query. Check kinds: state(`primary_cta`, `no_errors`, `loaded`, `route`, `modal_open`, `modal_closed`, `heading_present`, `input_count`) + style(`computed_style`, `class_present`, `class_absent`). Figma → Tailwind 패턴 → `references/figma-tailwind-check.md`. |
| `browser_check_console({ level?, clear?, includeNoise? })` | Drain in-memory console buffer (noise auto-filtered). |
| `browser_check_network({ status?, urlContains?, clear? })` | Drain network buffer (default: errors only). |

### Tasks (반복 flow)
| Tool | Purpose |
|---|---|
| `browser_load_tasks({ path })` | Load declarative JSON tasks file. Auto-loaded from `$VERIFIER_TASKS_PATH` at startup if set. |
| `browser_list_tasks()` | List loaded task names + args + step counts. |
| `browser_run_task({ name, args? })` | Execute task by name. `{{argName}}` 치환. bail-on-error. |

### Escape / Media (advanced)
| Tool | Purpose |
|---|---|
| `browser_eval({ script, timeoutMs? })` | Raw JS eval. **Escape hatch only** — use only when semantic_state / verify / task로 표현 불가능할 때. |
| `browser_screenshot({ name?, fullPage?, format?, quality? })` | JPEG@70 default → `/tmp/<name>.jpeg`. cat 1-a one-off only. |

---

## Task Workflow

### Existing task로 실행

```
1. browser_setup({ port })
2. (project tasks auto-loaded via $PWD/.browser-verifier/tasks.json — Standard Cycle 2번 참고)
3. browser_run_task({ name: "performLogin", args: { email, password } })
4. browser_verify({ checks: [{ type: "route", expected: "**/dashboard" }, ...] })
5. browser_check_console + browser_sentinel_save
```

### 새 task 작성 — lazy creation 패턴 (LLM 자동)

사용자가 자연어로 반복 가능한 flow를 요청하면 LLM이 자동 수행:

1. **Read 컴포넌트 코드** — 라우트, selector, 버튼 텍스트 확인
2. (필요 시) `browser_semantic_state` / `browser_eval`로 라이브 인스펙트
3. `$PWD/.browser-verifier/tasks.json` 존재 확인
   - **없음** → Write 툴로 디렉토리 + 파일 생성, 새 task를 포함한 JSON 작성
   - **있음** → Read → 새 task 추가 → Write로 덮어쓰기
4. `browser_load_tasks({ path: "$PWD/.browser-verifier/tasks.json" })` 리로드
5. `browser_run_task`로 실행 → 결과 확인
6. 보고에 **"📝 새 task `<name>` 추가됨 — review 후 commit 권장"** 1줄 포함

### "반복 가능한 flow"의 판단 기준

다음 중 하나라도 해당하면 task로 작성:

- 사용자가 동일 단어로 두 번 이상 요청한 flow ("로그인 후 ~ 다시 확인")
- 인증 / 다단계 폼 / 모달 열기 / 회원가입 같은 보편적 user flow
- 사용자가 명시적으로 "task로 만들어줘" / "재사용할 거야"
- regression suite 후보 (PR마다 굴릴 만한 검증)

한 줄짜리 assertion이나 ad-hoc 인스펙션은 task로 만들지 않음 — `verify` / `eval`로 끝.

### Task JSON 포맷 (요약)

```json
{
  "taskName": {
    "description": "사람을 위한 설명 (옵션)",
    "args": ["arg1", "arg2"],
    "steps": [
      { "op": "goto", "url": "/login" },
      { "op": "fill", "selector": "...", "value": "{{arg1}}" },
      { "op": "click", "text": "로그인" },
      { "op": "navigate", "clickText": "Save", "expectedUrl": "**/dashboard" },
      { "op": "wait_selector", "selector": "[role=dialog]", "timeoutMs": 3000 },
      { "op": "verify", "checks": [{ "type": "modal_open", "expectedTitle": "..." }] },
      { "op": "screenshot", "name": "after-save" }
    ]
  }
}
```

ops: `goto` · `click` · `fill` · `navigate` · `reload` · `wait_url` · `wait_text` · `wait_selector` · `wait_load` · `verify` · `screenshot`.

전체 예시: `templates/tasks.example.json`.

---

## Standard Cycle (Light Path)

Target: 3-5 MCP calls, < 10s wall time.

1. `browser_setup({ port })` — port from `.env.local`, or omit for auto-detect.
2. **Project tasks auto-load** — `$PWD/.browser-verifier/tasks.json` 있으면 `browser_load_tasks({ path: ... })` 호출. 없으면 무시(silent). 사용자에게 알림 X.
3. **Read 컴포넌트 코드 먼저** — DOM 구조 / selector / 라우트 파악.
4. Category에 맞는 검증 (아래 결정표):
   - Reusable flow → `browser_run_task` 1콜
   - 일회성 assertion → `browser_verify` 1콜
   - Ad-hoc inspection → `browser_eval` (필요할 때만)
5. `browser_check_console({ level: "error", clear: true })`.
6. `browser_check_network({ status: "errors" })` — API 변경 시.
7. `browser_sentinel_save()` — PASS 또는 wiring-only SKIP일 때.

### 도구 결정표

| 변경 성격 | 도구 |
|---|---|
| 페이지 상태 한 번 스냅샷 (route / CTA / errors / modal) | `browser_semantic_state` |
| 다중 assertion (route + heading + cta + errors 등) | `browser_verify` 한 콜 |
| 반복 multi-step flow (로그인, 모달 열기, 폼 제출) | `browser_run_task` |
| 새 flow 작성 후 회귀 가능 | task 정의 → load → run |
| 표현 불가능한 raw 인스펙션 (computed style, classList, 객체 내부) | `browser_eval` IIFE |
| 디자인 토큰 매칭 | `browser_eval` + classList → `references/token-check.md` |
| Console / Network 에러 | `check_console` / `check_network` |
| 시각 sanity ("화면에 떴는지") | `browser_screenshot` + Read |

---

## Plan announcement (no approval)

Tier + Category 결정 직후 **승인 받지 말고 즉시 실행**. 한 줄 알림만:

```
Light path 진입 (5-10초 예상) — /record에서 verify(route+cta+no_errors) + console
```

금지: "진행할까요?" / "검증 계획: ..." 같은 승인 대기. 첫 콜을 날리고 결과만 보고.

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
| **Light** | page-scoped 변경만, < 80줄 | 3-5 MCP 직접 | < 10s |
| **Full** | 라우팅/middleware/service/api 변경, > 80줄, 또는 Fix Loop 2회차 | Subagent (haiku) | < 60s |

**Page-scoped = Light:** `src/app/<route>/_components/`, `_lib/`, `_mock/`, `_store/`.
**Global = Full:** `src/lib/`, `src/service/`, `src/middleware.ts`, `route.ts`, 새 `page.tsx`.

상세 알고리즘 / red flag → `references/tier-selection.md`.

---

## Category Selection (무엇을 검증할지)

diff 패턴으로 cat set 결정. cat 4(console + network)는 항상 디폴트 포함.

| 변경 | cat | 주력 도구 |
|---|---|---|
| Tailwind / tokens.css / 색 변경 | 1-a + 1-b | `verify`(class_present + computed_style) + `screenshot` |
| Figma MCP → Tailwind 적용 | 1-b | `verify`(class_present + computed_style) → `references/figma-tailwind-check.md` |
| 새 JSX mount / 조건부 렌더 | 1-a | `verify` + `screenshot` |
| 새 `onClick` / nav 트리거 | 2 | `verify` (route check) or task |
| 폼/모달/다단계 | 3 | task (이미 정의됐으면 run, 아니면 작성) |
| API/mutation/fetch | 4 | `check_console` + `check_network` |
| useEffect 초기 fetch | 4 + 1-a | `check_network` + `verify({loaded})` |
| Figma 토큰 적용 (classList / computed 검증) | 1-b | `verify` (style checks) → `references/token-check.md`, `references/figma-tailwind-check.md` |

상세 매핑표 → `references/category-selection.md`.

---

## Reporting Tone

매 보고에 elapsed `(Xs)` 포함. PASS 보고에 **"체크: ..."로 무엇을 확인했는지 요약**.

길이 룰:
- 항목 3개 이내 → 한 줄에 ` / `로 구분
- 4개 이상 또는 80자 초과 → bullet (최대 5개)

```
✅ PASS — 검증 통과 (5.4s) — light path
   체크: route /record / primary CTA "저장" enabled / heading 존재 / 토큰 / console 에러 0

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
| `.browser-verifier/tasks.json` 없음 | 정상 — Standard Cycle 2번에서 silent skip. 사용자에게 알림 X. |
| tasks.json 파싱 실패 | "tasks.json 파싱 실패 — 해당 사이클은 task 없이 진행" 1줄 알림 + verify/eval로 진행 |

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
5. Light: 메인 직접 3-5 MCP 콜 (< 10s)
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
- `references/figma-tailwind-check.md` — Figma MCP → Tailwind 적용 결정적 검증 (computed_style / class_present + OKLCH 함정)

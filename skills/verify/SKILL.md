---
name: verify
description: |
  Use when verifying code changes in the live browser — behavior, styles, console/network errors, Figma spec conformance — via the browser-verifier MCP. Korean triggers: "확인해줘", "검증해줘", "검증시켜줘", "잘 됐는지 봐줘", "잘 뜨는지 확인해줘", "적용됐는지 봐줘", "깨진 데 없어?", "회귀 검사해줘", "콘솔 에러 봐줘", "시안대로 됐는지 확인해줘". Also auto-invoke whenever the Stop hook injects "[auto-verify]".
  Verification-only — operations (navigate / click / fill / press_key / select_option) belong to agent-browser, paired via shared Chrome CDP (default :9223). NOT for pixel-perfect visual diffing.
---

# Browser Verifier (Playwright + Task Runtime)

Deterministic verification on top of Chrome 9223 via Playwright `connectOverCDP`. One session per cycle. **LLM decides WHAT to verify; runtime decides HOW** (hydration / retry / stabilization은 runtime 처리).

## 페어링 (조작은 agent-browser, 검증은 본 MCP)

본 MCP는 **검증 전용**. 조작(click/fill/navigate)은 `agent-browser`에 위임하는 게 권장 워크플로. 검증·조작 모두 **같은 CDP Chrome**(기본 :9223, `$BROWSER_VERIFIER_CDP_URL`로 변경)을 공유한다.

- **조작 붙이기(권장)**: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/agent-browser-attach.sh" <devPort> [cdpPort]` → 이후 조작은 `agent-browser --session browser-verifier <cmd>`.
- **검증 붙이기**: `browser_setup({ port: <devPort>, cdpPort })` (cdpPort 생략 시 기본 :9223).
- 첫 셋업: `/browser-verifier:setup-paired-browser` (인터랙티브 가이드).
- Chrome 띄우기만: `/browser-verifier:launch-chrome [port]` — idempotent.
- 세션 시작 시 Chrome 안 떠있으면 SessionStart hook이 자동 안내.

> ⚠️ **`agent-browser --cdp <port>`를 직접 부르지 말고 래퍼를 쓸 것.** 이유 2가지:
> 1. agent-browser는 공용 `default` 세션을 재사용한다. 세션이 한 번 다른(스폰된) 크롬에 묶이면 이후 `--cdp <port>`가 **무시**되고 새 크롬을 띄운다 → 검증 대상과 다른 브라우저를 조작하게 됨.
> 2. `--cdp`는 크롬 **인스턴스**만 지정하고 **탭**은 못 고른다. 한 CDP Chrome에 여러 앱 탭(3001/3002/3003)이 있으면 엉뚱한 탭을 잡는다.
> 래퍼는 **전용 세션 격리 + 개발포트로 정확한 탭 선택**을 한 번에 한다. 그래도 새 창이 뜨면 = stale 세션 → 래퍼 재실행(내부에서 그 세션만 스코프 리셋; 공유 크롬·default 세션은 안 건드림).

## The 5 Rules (memorize)

1. **`browser_setup` FIRST** — once per cycle. PORT auto-detect (`.env.local` / lsof). Skip → 다른 도구 모두 fail.
2. **Repeated flows = tasks; one-off = primitives** — `.browser-verifier/tasks.json`에 등록 후 `browser_run_task({name})`. 1회성은 `browser_verify` 또는 `run_task({steps})` 인라인. 새 task 작성 패턴 → `references/task-workflow.md`.
3. **`browser_verify` > 여러 `browser_eval`** — assertion은 verify 한 콜로. eval은 verify로 표현 불가능한 ad-hoc에만.
4. **`browser_check_console` 자동 노이즈 필터** (HMR / Bridge / 다른 워크트리 포트 제거). 사용자가 명시적으로 요청할 때만 실행.
5. **`browser_sentinel_save`로 마무리** — PASS / wiring-only SKIP / ESCALATION 후 항상. (ESCALATION도 저장 — 사용자에게 이미 보고했으므로 같은 diff로 Stop hook이 재트리거되면 안 됨. 코드를 다시 고치면 hash가 바뀌어 자연히 재검증됨.)

**No pixel-perfect diffing** — token 매칭(classList / computed rgba)은 OK, 1-2px 비교는 영역 밖.

## 도구 구성 (15)

- **Lifecycle**: `browser_setup` · `browser_tab_list` · `browser_sentinel_save`
- **Inspection**: `browser_semantic_state` · `browser_inspect` · `browser_get_url` · `browser_is_visible`
- **Verify**: `browser_verify` · `browser_check_console` · `browser_check_network`
- **Tasks**: `browser_load_tasks` · `browser_list_tasks` · `browser_run_task`
- **Escape**: `browser_eval` · `browser_screenshot`

> 직접 조작 도구(`browser_fill / click / press_key / select_option / navigate`)는 본 MCP에서 **제거**됨. 조작은 외부 도구(`agent-browser`)에 위임. 멀티스텝 조작이 필요하면 `browser_run_task` 사용 (내부 `cdp/actions` 그대로 동작).

**`inspect` vs `verify`** — `inspect`은 **관찰**(observed만 반환, expected 불필요). 값 모를 때 / 첫 Figma 비교 / 토큰 캡처용. `verify`의 `computed_style` · `class_present`는 **assertion**(expected 대 observed 비교, pass/fail). 값 확정 후 회귀 가드. 둘 다 한 콜에 다중 selector 배치 처리.

각 도구 시그니처 / 옵션은 MCP description 참조 (ToolSearch).

## Standard Cycle (Light Path)

Target: 3-5 MCP calls, < 10s.

1. `browser_setup({ port })` — PORT는 `.env.local` 또는 auto-detect.
2. **Project tasks auto-load** — `$PWD/.browser-verifier/tasks.json` 있으면 `browser_load_tasks`. 없으면 silent skip.
3. **⚠️ 라이브 인스펙션 먼저, 코드 선파악 금지** — selector / route / DOM 구조 / 요소 존재는 `eval` / `semantic_state`로 화면에 직접 물어보는 게 코드 읽기보다 빠름. 컴포넌트 코드는 **예상과 다를 때 핸들러 1파일만** Read. 전체 플로우 선파악 / 서브에이전트 매핑 ❌ (서프라이즈 없는데 코드부터 = 느림의 1번 원인).
4. 도구 결정표대로 검증.
5. `browser_check_console({ level: "error" })` — 사용자가 명시 요청 시.
6. `browser_check_network({ status: "errors" })` — API 변경 시.
7. `browser_sentinel_save()` — PASS / SKIP일 때.

### 도구 결정표

| 변경 성격 | 도구 |
|---|---|
| 스냅샷 1회 (route / CTA / errors / modal) | `semantic_state` |
| 스타일/텍스트/rect/attr **관찰** (expected 모름, 1차 Figma 비교, 토큰 캡처) | `inspect` |
| 다중 assertion 한 콜 (expected 확정 후 회귀 가드) | `verify` |
| 임의 요소 텍스트 확인 (토스트/라벨/셀 값) | `verify`(`text` — contains/equals) |
| 모달 닫힘 / 토스트 소멸 대기 | `run_task`의 `wait_gone` step |
| 반복 multi-step flow | `run_task({ name })` |
| 1회성 mixed (click + wait + verify 연쇄) | `run_task({ steps })` 인라인 |
| 입력 / 클릭 / 키 / URL 직접 이동 (1회성) | 외부 `agent-browser`로 위임 |
| 멀티스텝 인터랙션 (반복용) | `run_task` (내부 `cdp/actions` 사용) |
| 표현 불가능한 raw 인스펙션 | `eval` IIFE |
| 디자인 토큰 매칭 | `verify`(`class_present` + `computed_style`) → `references/token-check.md` |
| Figma spec 일괄 검증 (typography + style + hover/focus/active) | `verify`(`figma_spec`) → `references/figma-spec-workflow.md` |
| Console / Network 에러 | `check_console` / `check_network` |
| 시각 sanity | `screenshot` + Read |

## ⚠️ 실패 시 행동 (Fail handling)

step / 클릭 실패로 떠도 **같은 액션 재시도 X.** harness의 `ok:false`는 false-fail일 수 있음 (타임아웃이어도 액션은 실제로 발생 — 특히 클라이언트 nav 클릭).

1. **harness ok/fail 말고 라이브 상태부터 확인** — `eval` 1콜로 `route + (필요 시)console + 타깃 요소`를 **한 번에**. 바뀌었으면 사실상 성공 → 다음으로.
2. **진단은 1콜로 묶기** — route / console / DOM 따로 X. 막혔을 때야말로 한 `eval`에 다 넣는다.
3. **같은 클릭 반복 X** — 왜 안 닿았는지(오버레이 / 포털 / disabled / 애니메이션)를 1콜로 진단하고, 방식을 바꾼다. 1회성 클릭은 외부 `agent-browser`(`click @ref` → `click --text`)로 시도, 마지막 escape는 `eval`의 `el.click()`.

## Plan announcement

Tier + Category 결정 직후 **승인 X, 즉시 실행**. 한 줄 알림만:

```
Light path 진입 (5-10초 예상) — /record에서 verify(route+cta+no_errors)
```

Wiring-Only SKIP / 코드 변경 없음 → 알림도 생략.

## Wiring-Only Skip Gate

3조건 충족 → silent SKIP (sentinel만 저장, 사용자 채팅 출력 X):
1. wiring 단순 (prop / className / variant 교체, 새 로직 X)
2. 동일 패턴이 코드베이스 다른 곳에서 이미 동작
3. 잘못되면 사용자가 1클릭으로 catch 가능

상세 예시 / 경계 케이스 → `references/skip-gate.md`.

## Tier Selection

| Path | When | Target |
|---|---|---|
| **Light** | page-scoped (`src/app/<route>/_components/`, `_lib/`, `_mock/`, `_store/`), < 80줄 | < 10s, 메인 직접 |
| **Full** | global (`src/lib/`, `src/service/`, `middleware`, `route.ts`, 새 `page.tsx`) / > 80줄 / Fix Loop 2회차 | < 60s, subagent (haiku) |

상세 알고리즘 / red flag → `references/tier-selection.md`.

## Category Selection

diff 패턴 → cat → 도구 매핑. 주력 도구는 도구 결정표(위)에 정리. 매핑 표는 `references/category-selection.md`.

## Reporting Tone

매 보고 elapsed `(Xs)`. PASS는 "체크: …"로 무엇 확인했는지 요약. 3 이내는 ` / `, 4+ 또는 80자 초과는 bullet (최대 5).

```
✅ PASS — 검증 통과 (5.4s) — light path
   체크: route /record / CTA "저장" enabled / heading 존재 / console 0

🔧 PASS after fix — 1차 실패 → 수정 후 통과 (52s)

⏭️ SKIP (인프라) — dev 서버 미기동

❌ ESCALATION — 발견 문제 / 시도 요약 / 추측 root cause. 코드는 마지막 수정 유지.
```

Silent SKIP (wiring-only) → 채팅 출력 X.

## Infra Errors

Dev 서버 미기동 / Chrome 9223 미기동 / 보호 라우트 / Diff > 300줄 등 → `references/infra-errors.md`.

## Subagent Dispatch (Full Path)

`Agent` + `general-purpose` + 모델 **haiku** (Opus 대비 2-3배 빠름). Brief 템플릿 / Fix Loop 흐름 → `references/full-path-brief.md`.

## Workflow Summary

```
1. Auto-verify 시그널 / 사용자 요청
2. 코드 변경 없음 → silent sentinel + 종료
3. Wiring-Only Skip Gate 통과 → silent sentinel + 종료
4. Tier + Category 결정 → 1줄 알림
5. Light: 메인 직접 3-5 콜 / Full: 서브에이전트 dispatch
6. PASS → "체크: …" + sentinel
   FAIL → Fix Loop (systematic-debugging → 수정 → 재검증, 최대 2회) → 막히면 에스컬레이션 + sentinel
```

## References (lazy load)

- `references/task-workflow.md` — inline steps 예시 + lazy creation 패턴 + task JSON 포맷
- `references/skip-gate.md` — Wiring-Only Skip Gate 상세 예시
- `references/infra-errors.md` — Infra Error 처리표
- `references/tier-selection.md` — page-scoped 글로브 + 알고리즘 + red flag
- `references/category-selection.md` — diff → cat 매핑
- `references/full-path-brief.md` — subagent Brief 템플릿 + Fix Loop
- `references/token-check.md` — classList → computed rgba 폴백
- `references/figma-tailwind-check.md` — Figma → Tailwind 결정적 검증 (computed_style / class_present + OKLCH 함정)
- `references/figma-spec-workflow.md` — `figma_spec` check 한 줄로 typography + style + hover/focus/active 일괄 검증

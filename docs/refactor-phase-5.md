# Phase 5 — Declarative Task System

리팩터 5단계. 반복되는 verification flow를 선언적 JSON으로 결정화. 사용자는 자연어로 LLM에게 시키고, LLM이 JSON을 만들어서 커밋. 이후엔 task 이름으로 재사용.

## 결정

- 패턴 2 — JSON 선언적 레시피. 패턴 1 (TS dynamic load) / 패턴 3 (LLM 매번 composition)은 미채택.
- 사용자가 손으로 JSON 짤 일은 거의 없음. LLM이 만들고, 사용자는 review + commit.
- task는 **app-specific** — 이 repo에는 template 1개만, 실제 task는 사용자 프로젝트의 `.browser-verifier/tasks.json`.

## 파일 포맷

```json
{
  "taskName": {
    "description": "사람을 위한 설명 (옵션)",
    "args": ["argName1", "argName2"],
    "steps": [
      { "op": "goto", "url": "/login" },
      { "op": "fill", "selector": "...", "value": "{{argName1}}" },
      ...
    ]
  }
}
```

- top-level: `Record<taskName, TaskDefinition>`
- `steps` 내부 문자열은 `{{argName}}` 템플릿 치환됨 (JSON 순회 시 모든 string 필드 적용)
- bail-on-error — 첫 실패 step에서 정지, `failedAt` 인덱스 반환

## 지원 ops

기존 19개 raw 툴의 핵심 동작을 그대로 재사용:

| op | runtime 호출 |
|---|---|
| `goto` | `navigate(url, timeoutMs?)` |
| `click` | `clickByText(text)` |
| `fill` | `fillReactInput(selector, value)` |
| `navigate` | `clickAndWaitForUrl(clickText, expectedUrl, timeoutMs?)` |
| `reload` | `reload()` |
| `wait_url` | `waitForUrl(pattern, timeoutMs?)` |
| `wait_text` | `waitForText(text, timeoutMs?)` |
| `wait_selector` | `waitForSelector(selector, timeoutMs?)` |
| `wait_load` | `waitForLoad(state?, timeoutMs?)` |
| `verify` | `runVerify(page, checks)` — Phase 4의 verification framework |
| `screenshot` | `captureScreenshot(opts)` — Phase 5에서 runtime primitive로 추출 |

## 추가 파일

| 파일 | 역할 |
|---|---|
| `src/runtime/tasks/types.ts` | `TaskOp`(discriminated union), `TaskDefinition`, `TasksFile`, `StepRecord`, `TaskRunResult` |
| `src/runtime/tasks/registry.ts` | in-memory singleton: 현재 로드된 tasks + source path |
| `src/runtime/tasks/loader.ts` | JSON parse + validation. 알 수 없는 op / required 필드 누락 시 warnings에 기록 |
| `src/runtime/tasks/runner.ts` | 템플릿 substitution + step dispatch + bail-on-error |
| `src/runtime/screenshot.ts` | `tools/screenshot.ts`에서 캡처 inner 로직 추출 (runner/tool 양쪽에서 사용) |
| `src/tools/tasks.ts` | `browser_load_tasks` / `browser_list_tasks` / `browser_run_task` 3개 MCP 툴 |
| `templates/tasks.example.json` | 사용자 시작점 — `openPartnerCreateModal`(예시), `performLogin`(generic skeleton) |

## MCP 표면 변화

| 신규 툴 | 입력 | 출력 |
|---|---|---|
| `browser_load_tasks` | `{ path: string }` | `{ loaded: [...names], warnings }` |
| `browser_list_tasks` | `{}` | `{ tasks: [{ name, description, args, stepCount }] }` |
| `browser_run_task` | `{ name, args? }` | `{ ok, steps: [...records], elapsedMs, failedAt? }` |

env `VERIFIER_TASKS_PATH`가 설정돼 있으면 server 시작 시 자동 load. stderr에 결과 로그.

MCP 툴 총 24개 (raw 19 + semantic 1 + verify 1 + tasks 3).

## 검증 — 2026-05-25

localhost:3000 + Chrome 9223 환경:

| 시나리오 | 결과 |
|---|---|
| 3개 task load + validation | warnings 0 |
| `openPartnerCreateModal` (5 steps: goto → verify → click → wait_selector → verify) | 5/5 PASS, 2.1s |
| `fillPartnerSearch` with `{{query}}=테스트쿼리` substitution | 3/3 PASS, 1.3s |
| `brokenStep` (의도적으로 없는 버튼 click) | bail-on-error, failedAt=1, error 메시지 명확 |
| 존재하지 않는 task name 호출 | clean error `task "nonexistent" not loaded. Use browser_load_tasks first.` |

## Phase 6와의 관계

Phase 6는 raw 19툴 제거 + SKILL.md/agents 재작성. 그 시점에는:

1. SKILL.md에 "검증 cycle은 task로 정의 → run" 패턴 명시
2. raw 툴 deprecate / 제거 (LLM은 task 이름으로 호출)
3. `templates/tasks.example.json`을 시작점 가이드로 활용

선언적 JSON 구조 덕분에 Phase 6 narrowing이 깔끔함 — LLM이 보는 표면이 "task 이름 + arg 객체" 둘로 좁혀짐.

## 의도적으로 안 한 것

- **TS 파일 dynamic load (패턴 1)** — 사용자 결정 시 추가 가능. 분기/루프 같은 복잡한 흐름이 필요할 때.
- **verification graph** (원래 Phase 5의 일부) — 현재 task = sequence. branching/parallel은 필요 시 추가.
- **SKILL.md / agents 업데이트** — Phase 6 surface-narrowing과 같이.

## Phase 5 종료 상태

- runtime primitives: client / safeClick / safeFill / waitPageStable / waitRouteChange / extractSemanticState / runVerify / runTask / captureScreenshot.
- MCP 툴 24개.
- 외부 raw 19툴 표면 호환 유지.

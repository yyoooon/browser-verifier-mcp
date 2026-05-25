# Phase 6 — Surface Narrowing

리팩터 마지막 단계. raw 행동/대기 툴 제거 + SKILL/agents를 task-중심으로 재작성.

## 결정 — 2026-05-25

surface를 14개 툴로 좁힘. raw action 10개 제거.

### 제거 (10개)
- Actions: `browser_click`, `browser_navigate`, `browser_fill_input`, `browser_goto`, `browser_reload`
- Waits: `browser_wait_url`, `browser_wait_text`, `browser_wait_selector`, `browser_wait_load`
- Composer: `browser_batch`

이 동작들의 runtime 함수(`src/cdp/actions.ts`, `src/cdp/wait.ts`)는 유지 — task runner가 사용. MCP 표면에서만 사라짐.

### 유지 (14개)

| 분류 | 툴 |
|---|---|
| Lifecycle | `browser_setup`, `browser_tab_list`, `browser_sentinel_save` |
| Observability | `browser_check_console`, `browser_check_network`, `browser_get_url`, `browser_is_visible` |
| Inspection | `browser_semantic_state` |
| Verification | `browser_verify` |
| Tasks | `browser_load_tasks`, `browser_list_tasks`, `browser_run_task` |
| Escape / Media | `browser_eval` (advanced), `browser_screenshot` |

### 새 LLM contract

| 상황 | 도구 |
|---|---|
| 1회성 페이지 상태 확인 | `browser_semantic_state` |
| 다중 assertion | `browser_verify` (8개 check 타입) |
| 반복 multi-step flow | `browser_run_task` |
| 새 flow 작성 | tasks.json에 추가 → `browser_load_tasks` → `browser_run_task` |
| 표현 불가능한 raw | `browser_eval` (escape only) |
| 진단 | `browser_check_*`, `browser_get_url`, `browser_is_visible` |

## 파일 변화

### 삭제
- `src/tools/actions.ts`
- `src/tools/wait.ts`
- `src/tools/batch.ts`
- `src/cdp/flow-compiler.ts` (batch 전용이라 함께 삭제)
- `src/lib/selector.ts` (flow-compiler 전용이라 함께 삭제)
- `src/lib/payload-guard.ts` (batch 전용이라 함께 삭제)

### 재작성
- `src/server.ts` — 10개 import / tools array entry / switch case 제거
- `skills/SKILL.md` — task-중심 cycle, 14-tool table, 결정표 갱신, "5 Rules"로 축약
- `skills/references/category-selection.md` — diff → 카테고리 매핑을 새 도구로
- `skills/references/full-path-brief.md` — subagent Brief에 task / verify / semantic_state 우선순위 반영
- `agents/verification-planner.md` — task vs verify vs eval 모드 선택 명시
- `agents/browser-executor.md` — 도구 우선순위 1=task, 2=verify, 3=semantic_state, 4=eval
- `templates/verification-plan.json` — task / verify / check_* / sentinel 단계 구조로

### 유지 (변경 없음)
- `agents/systematic-debugger.md` — role-only
- `skills/references/tier-selection.md` — diff-based 로직, 도구 무관
- `skills/references/token-check.md` — `browser_eval` 사용 (계속 유효)
- `templates/verification-result.json`, `templates/tasks.example.json`

## 검증 — 2026-05-25

새 14-tool contract만으로 verification cycle 완주:

| 단계 | 결과 |
|---|---|
| `browser_setup` | ok, 146ms |
| `browser_tab_list` | 1 tab attached |
| `browser_load_tasks` (2 tasks) | 0 warnings |
| `browser_list_tasks` | metadata 정확 |
| `browser_run_task gotoPartners` | 1 step, 1.5s |
| `browser_semantic_state` | route/cta/headings/inputCount 모두 정확, 6ms |
| `browser_verify` 5 checks | 5/5 PASS, 4ms |
| `browser_run_task openPartnerModal` (goto+click+wait+verify) | 4 steps PASS, 1.7s |
| `browser_eval` (textarea count) | escape hatch ok |
| `browser_is_visible` | ok |
| `browser_get_url` | ok |
| `browser_check_console` | 0 entries, 자동 필터 OK |
| `browser_check_network` | 0 entries |
| `browser_screenshot` | 77KB JPEG |

removed 툴 호출 시 → `Unknown tool: browser_<x>` 응답 (서버는 살아있음, ErrorBoundary 없이 graceful).

## 의도적으로 안 한 것

- `~/.claude.json` 자동 수정 — entry path는 그대로 `dist/server.js`라 변경 불필요. 사용자가 알아서 검토 가능.
- 기존 사용자의 SKILL.md 호환성 shim — Q1=(a) → (b) 전환 의도였으므로 명시적 break OK.
- 시각 verification graph — Phase 5의 declarative tasks가 sequence 처리하므로 graph 미도입. branching/parallel 필요 시 별도 phase에서 추가.

## 전체 리팩터 종료 상태

- **dependencies**: `playwright` + `@modelcontextprotocol/sdk`. `chrome-remote-interface` 0줄.
- **runtime primitives**: `client` (connectOverCDP) · `safeClick` · `safeFill` · `waitPageStable` · `waitRouteChange` · `extractSemanticState` · `runVerify` · `runTask` · `captureScreenshot`.
- **MCP 툴**: 14개 (Phase 0의 19 + semantic + verify + tasks ×3 - removed 10).
- **interaction 결정성**: Locator-based retry + 자동 hydration / networkidle / animation 정착. LLM이 timing을 micro-manage하지 않음.
- **semantic 추출**: 단일 `page.evaluate`로 compact state — raw DOM dump 불필요.
- **반복 flow**: declarative JSON, LLM이 생성 → 사용자가 커밋 → 결정적 재사용.
- **외부 표면**: 14-tool contract, task-centric SKILL.md / agents.

리팩터 6단계 모두 완료.

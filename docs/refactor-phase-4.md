# Phase 4 — Verification Framework (Generic)

리팩터 4단계. semantic state 위에 일관된 verification primitive를 얹음. **앱-특화 task는 미포함** (사용자가 자신의 앱에 맞게 추가).

## 결정

- option (a) — generic framework only. `performLogin` / `verifyCheckoutSummary` 같은 앱 의존 task는 작성하지 않음. 사용자가 자기 앱에 맞춰 별도 작성.
- 1개 MCP 툴 `browser_verify({ checks: [...] })`로 한 번에 여러 체크 평가. 한 번의 semantic state 추출 + 모든 체크 dispatch.

## 추가

### `src/runtime/verify/types.ts`

`VerifyCheck` discriminated union — 7개 generic 체크 타입:

| type | 의미 |
|---|---|
| `primary_cta` | semanticState.primaryCTA 존재. (옵션) text 포함, enabled. |
| `no_errors` | semanticState.errors 비어있음. |
| `loaded` | loading=false. (옵션) timeoutMs까지 polling. |
| `route` | 현재 location이 glob 패턴 매칭. search/hash 포함 후보 다 시도. |
| `modal_open` | 모달 열림. (옵션) expectedTitle 포함. |
| `modal_closed` | 모달 없음. |
| `heading_present` | h1/h2 중 텍스트 포함하는 heading 존재. |
| `input_count` | visible input/textarea/select 개수의 min/max/exact. |

반환:
```ts
interface VerifyResult {
  ok: boolean;            // 모든 체크 통과 시 true
  checks: CheckResult[];  // 체크별 ok + message + observed
  state: SemanticState;   // 평가에 사용된 snapshot
  elapsedMs: number;
}
```

### `src/runtime/verify/runVerify.ts`

`runVerify(page, checks)`가 entry point. 흐름:

1. `extractSemanticState(page)` 한 번 호출.
2. `loaded` 체크가 있고 현재 loading=true면 timeoutMs까지 polling 후 최신 state로 갱신.
3. checks 배열 순회하며 dispatch.
4. structured 결과 반환.

### `src/tools/verify.ts` + MCP

`browser_verify` 툴. 입력 스키마는 `{ checks: array<{ type: enum, ...rest }> }`. 추가 properties 허용(`additionalProperties: true`)으로 체크별 추가 필드(expectedText, min, max 등)를 전달.

description에 8개 체크 타입과 시그니처 명세를 풀로 적어둠 — LLM이 schema 외에 description으로 학습.

`src/server.ts`에 등록 — 21번째 툴.

## 검증 — 2026-05-25

dev 서버 localhost:3000, /partners 라우트:

| Scenario | 결과 |
|---|---|
| 7개 긍정 체크 (loaded, route /partners, no_errors, modal_closed, primary_cta=제휴업체 등록, heading=제휴업체 관리, input_count>=1) | 7/7 PASS, 16ms |
| 일부러 실패하게 한 5개 체크 (route /checkout, modal_open, primary_cta=Submit, heading=Nonexistent, input_count=99) | 5/5 FAIL, 메시지 모두 정확 |
| 모달 오픈 후 modal_open + modal_closed 동시 평가 | open=true, closed=false, 직교 평가 OK |

에러 메시지 예:
- `route "/partners" does not match "**/checkout"`
- `primary CTA text "제휴업체 등록" does not include "Submit"`
- `expected exactly 99 inputs, found 1`

## 의도적으로 안 한 것

- **앱-특화 task (performLogin, verifyCheckoutSummary 등)** — 사용자 결정.
- **Task class / registry / dynamic registration** — 현재 dispatch는 switch문 + 디스크리미네이션. 체크 종류가 늘면 그때 추상화.
- **체크 결과의 nested observed 트리** — 현재 observed는 string/number/Modal/PrimaryCTA처럼 작은 형태로만 노출.
- **SKILL.md / agents 업데이트** — Phase 6 surface-narrowing과 같이 처리.

## Phase 4 종료 상태

- runtime primitives: `client`, `safeClick`, `safeFill`, `waitPageStable`, `waitRouteChange`, `extractSemanticState`, `runVerify` (+ 8 check kinds).
- MCP 툴: 21개 (raw 19 + `browser_semantic_state` + `browser_verify`).
- 외부 표면 호환 유지.

Phase 5 (planner reduction / verification graph) 또는 Phase 6 (surface narrowing) 진행 가능.

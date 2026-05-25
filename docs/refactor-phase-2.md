# Phase 2 — Runtime Stabilization

리팩터 2단계. Phase 1이 깔아둔 Playwright runtime 위에서 interaction 결정성을 높임.

## 목표

- arbitrary sleep-based wait 제거
- route stabilization
- animation stabilization (Phase 1의 `waitPageStable`이 이미 처리)
- retry invariants

## 변경 사항

### A. `clickByText` 재설계 — tag-and-locate + 재시도

기존: `waitForFunction`이 반환한 ElementHandle에 `.click()` 직접 호출. React rerender로 element가 detach되면 click이 stale event를 발사하고 끝.

신규:
1. `waitForFunction`에서 매칭 element를 찾고 `data-vb-click-target` 속성을 부여 (tag).
2. Playwright Locator로 `[data-vb-click-target]`을 가리키고 `safeClick` 호출.
3. Locator는 click 시점에 element를 재해결(re-resolve)하므로 staleness에 강함.
4. `safeClick` 실패 시 `findAndTag`를 다시 호출해 재태깅 후 1회 재시도.
5. `safeClick`이 click 후 `waitPageStable`로 정착 대기.

코드: `src/cdp/actions.ts:clickByText`.

### B. `clickAndWaitForUrl`에 route stabilization 추가

URL 패턴 매칭 성공 후 `waitPageStable({ networkIdle: true, animations: false, timeoutMs: 3000 })` 호출. 새 라우트의 fetch 등이 끝날 때까지 bounded waiting.

### C. `navigate(url)` / `reload()` 정착

`page.goto({ waitUntil: "load" })` / `page.reload({ waitUntil: "load" })` 직후 `waitPageStable({ networkIdle: true, animations: false, timeoutMs: 3000 })`. user-side sleep 없이 page-ready 보장.

### D. arbitrary sleep 정책

host-side 코드에 임의 sleep 없음. `src/cdp/eval.ts`의 `withTimeout`은 timeout race용으로 필수. `src/cdp/target.ts`의 `req.setTimeout`은 HTTP connection timeout. `src/cdp/flow-compiler.ts`의 in-page polling(`setTimeout(r, 50)` / `setTimeout(r, 100)`)은 컴파일된 IIFE 내부에서만 동작 — 호스트 orchestration이 아니라 별도 검토 대상 (Phase 3+).

## 검증 — 2026-05-25

이전 Phase 1 검증에서 발견된 "Test 2: clickByText 후 URL 미변경" 케이스의 진짜 원인:

- click 자체는 정상 발사됨.
- React-Router SPA transition은 비동기 — click 리턴 시점에는 아직 URL이 안 바뀐 상태.
- 500ms 측정 윈도우가 너무 짧았음 (실제로는 800ms+ 후 `/admin-account`).
- 즉 `clickByText`는 contract상 click event만 발사하고 리턴하는 게 맞음. navigation 동기화는 `clickAndWaitForUrl`의 책임.

올바른 API(`clickAndWaitForUrl`)로 같은 시나리오 5회 재검증:

| Trial | ok | finalUrl | elapsedMs |
|---|---|---|---|
| 1 | ✅ | /admin-account | 375 |
| 2 | ✅ | /admin-account | 356 |
| 3 | ✅ | /admin-account | 352 |
| 4 | ✅ | /admin-account | 356 |
| 5 | ✅ | /admin-account | 357 |

5회 모두 deterministic, 350-380ms 범위. `navigate`/`reload`도 stabilize 포함해서 ~1.1s. negative case는 clean error.

## 부산물

Phase 2 작업 중 알게 된 것: 어제 Phase 1 검증 때 "URL 미변경"으로 보였던 케이스는 측정 오류였음. Phase 1 마이그레이션 자체는 그 시점에도 이미 정상 동작 중이었음. Phase 2의 견고성 향상은 그래도 유효 — Locator-based click은 stale element 시나리오에 강하고, route stabilization은 후속 액션이 새 라우트 위에서 실행되도록 보장.

## Phase 2 종료 시점 상태

- 모든 raw CDP 의존 제거 (Phase 1 완료).
- Click → navigation 흐름이 결정적.
- `safeClick` / `safeFill` / `waitPageStable` / `waitRouteChange` runtime primitives 안정.
- 외부 MCP 툴 19개 시그니처 그대로.

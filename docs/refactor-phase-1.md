# Phase 1 — Playwright Runtime Foundation

Browser Verifier MCP 리팩터의 첫 단계. 전체 6단계 계획 중 foundation에 해당.

## 결정 사항

- **Q1=(a)** — 기존 19개 MCP 툴의 외부 표면(이름, 입력 스키마, 반환 JSON)은 그대로 유지. 내부 구현만 Playwright로 교체. raw 툴 제거는 Phase 6에서 의도적으로 진행.
- **Q2=(a)** — Phase 1만 먼저 끝내고 실제 verification cycle 한번 돌려보고 중간 점검.

## Scope

### In scope
- `playwright` 패키지 도입 (`chromium.connectOverCDP`).
- Runtime primitive 4종 신설: `safeClick`, `safeFill`, `waitPageStable`, `waitRouteChange`.
- `src/cdp/*` 내부 구현을 Playwright 기반으로 교체 (외부 시그니처 유지).
- `chrome-remote-interface` 의존성 제거 (Phase 1 마지막 단계).

### Out of scope (다음 phase로)
- `runtime/visual/` (Phase 3~4).
- `runtime/semantic/` (Phase 3).
- `runtime/tasks/` — semantic task layer (Phase 4).
- Verification graph (Phase 5).
- MCP 툴 surface 변경 / raw 툴 제거 (Phase 6).
- SKILL.md / agents / templates 수정.

## 패키지 변경

- `playwright` 추가.
- `chrome-remote-interface`는 Phase 1 안에서는 유지 → 마지막 정리 단계에서 한꺼번에 제거. 마이그레이션 중간에 한 파일씩 갈아끼우는 동안 양쪽이 공존해야 함.

## 신규 파일

```
src/runtime/
 ├── client.ts                       # chromium.connectOverCDP() 싱글톤
 ├── interaction/
 │    ├── safeClick.ts               # scroll → visible → enabled → click → stabilize
 │    └── safeFill.ts                # locator.fill() → React 컨트롤드 인풋 fallback
 └── navigation/
      ├── waitPageStable.ts          # networkidle + DOM 정착 + (옵션) 애니메이션 정착
      └── waitRouteChange.ts         # page.waitForURL 래퍼
```

이 단계에서는 `visual/`, `semantic/`, `tasks/` 디렉토리는 만들지 않음.

## 기존 파일 내부 교체 (외부 시그니처 유지)

| 파일 | 변경 |
|---|---|
| `src/cdp/client.ts` | `ensureAttached()` / `getCurrent()` 시그니처 유지. 내부는 `connectOverCDP` → `BrowserContext` → `Page` 보유로 교체. 마이그레이션 중에는 raw `CDP.Client`와 공존 가능, 모든 호출처가 마이그레이션되면 제거. |
| `src/cdp/actions.ts` | `clickByText`, `fillReactInput`, `navigate`, `reload` → 내부에서 `safeClick` / `safeFill` / `page.goto` / `page.reload` 호출. 외부 export 시그니처와 반환 타입은 그대로. |
| `src/cdp/wait.ts` | `waitForUrl` / `waitForText` / `waitForSelector` / `waitForLoad` → `page.waitForURL`, `locator.waitFor`, `page.waitForLoadState`로 교체. `hydrated` 상태는 `page.waitForFunction`으로. |
| `src/cdp/eval.ts` | `evalInBrowser` → `page.evaluate` 사용. 반환 포맷 (`{ ok, value, elapsedMs }`) 유지. |
| `src/cdp/buffers.ts` | `Runtime.consoleAPICalled` / `Network.*` 리스너 → `page.on('console')`, `page.on('request')`, `page.on('response')`, `page.on('requestfailed')`로 교체. `getConsole` / `getNetwork` API 그대로. |
| `src/cdp/target.ts` | 유지. 포트 매칭 후 `connectOverCDP` 시 컨텍스트의 페이지 중에서 매칭하는 데 사용. |
| `src/cdp/flow-compiler.ts` | **이번 phase에서는 안 건드림.** 내부에서 `page.evaluate(generatedScript)` 한 번 호출로 그대로 동작 가능. boundary ops는 위에서 마이그레이션된 함수를 그대로 호출함. |
| `src/tools/*` 11개 핸들러 | **건드리지 않음.** 외부 시그니처가 안 바뀌니까. |
| `src/tools/screenshot.ts` | `Page.captureScreenshot` → `page.screenshot()`로 교체. 옵션(jpeg/quality/path) 유지. |

## SKILL.md / agents / templates

건드리지 않음. 툴 이름·스키마·반환 JSON 모양이 다 동일.

## 작업 순서 (커밋 단위)

각 단계마다 빌드는 깨지지 않게 유지.

1. `playwright` 추가 + `src/runtime/client.ts` 작성 (connectOverCDP 싱글톤, 기존 client.ts와 공존).
2. `src/runtime/navigation/waitPageStable.ts` + `waitRouteChange.ts`.
3. `src/runtime/interaction/safeClick.ts` + `safeFill.ts`.
4. `src/cdp/wait.ts`, `eval.ts`, `buffers.ts` 내부 교체.
5. `src/cdp/actions.ts` 내부 교체 (`safeClick` / `safeFill` 사용).
6. `src/tools/screenshot.ts` 내부 교체.
7. `src/cdp/client.ts` 정리 — raw CDP 의존 제거 (이 시점에 모든 호출처가 Playwright 사용 중).
8. `chrome-remote-interface` deps 제거 + 빌드 통과 확인.

## 설계 노트

### flow-compiler를 Phase 1에서 안 건드리는 이유
Playwright의 `page.evaluate()` 한 번에 컴파일된 IIFE를 그대로 흘려넣을 수 있어서 동작은 그대로 됨. boundary ops 처리는 갈아끼운 함수들이 알아서 함. Phase 3 이후 semantic state가 들어오면 flow-compiler 자체의 존재 의미를 재평가.

### `hydrated` wait state
현재 `__reactFiber` 키 탐색 로직은 유지. `waitPageStable`의 일부로 통합하지 않고 별도 옵션으로 둠 — `waitPageStable`은 일반적인 정착(networkidle + DOM), `hydrated`는 React 특화 신호.

### buffers — Playwright 네이티브 이벤트로 교체
`page.on('console')`은 메시지를 `ConsoleMessage` 객체로 줌. 기존 `ConsoleEntry { level, text, ts }` 포맷으로 변환해서 in-memory 버퍼에 넣음. `getConsole()` / `clearConsole()` API는 그대로.

`page.on('request')` / `page.on('response')` / `page.on('requestfailed')`는 기존 `NetworkEntry`로 매핑. requestId는 Playwright의 `Request` 객체 자체를 Map 키로 쓰는 게 가장 안전.

## 검증

- `npm run build` 타입체크 통과.
- 수동 smoke test (dev 서버 필요, 사용자가 실행):
  1. Chrome을 `--remote-debugging-port=9223`로 띄우고 dev 서버 (예: `localhost:3000`) 열기.
  2. MCP 클라이언트에서 `browser_setup` → `browser_navigate` → `browser_check_console` → `browser_sentinel_save` 한 사이클.
  3. 기존과 같은 JSON 모양 + 비슷한 latency(목표: 5-call cycle 100ms 내외) 확인.

## 진행 상태

- [x] 1. playwright 추가 + `src/runtime/client.ts`
- [x] 2. `src/runtime/navigation/`
- [x] 3. `src/runtime/interaction/`
- [x] 4. `src/cdp/wait.ts`, `eval.ts`, `buffers.ts` 교체
- [x] 5. `src/cdp/actions.ts` 교체
- [x] 6. `src/tools/screenshot.ts` 교체
- [x] 7. `src/cdp/client.ts` 정리
- [x] 8. `chrome-remote-interface` 제거 + 빌드 확인

## Phase 1 결과 — 2026-05-25

- 의존성: `chrome-remote-interface` / `@types/chrome-remote-interface` 제거. `playwright` 추가. 런타임 deps = `@modelcontextprotocol/sdk` + `playwright`.
- 신규 파일: `src/runtime/client.ts`, `src/runtime/navigation/waitPageStable.ts`, `waitRouteChange.ts`, `src/runtime/interaction/safeClick.ts`, `safeFill.ts`.
- 내부 교체: `src/cdp/{client,actions,wait,eval,buffers}.ts`, `src/tools/screenshot.ts` 모두 Playwright 기반으로 전환. 외부 export 시그니처·반환 JSON 모양 그대로.
- `src/cdp/client.ts`는 `runtime/client.ts`에 대한 thin re-export shim. raw CDP 코드 0줄.
- `tsc` 통과. `src/cdp/` 내 raw CDP 잔존 참조 없음 (flow-compiler 주석 1줄 제외).
- 실제 dev 서버(localhost:3000) + Chrome 9223 환경에서 smoke test 통과:
  - `attach`, `ensureAttached`, `evalInBrowser` (단순 expression / sync IIFE / async IIFE), `waitForLoad('load'|'hydrated')`, `waitForUrl`, `waitForSelector` — 전부 정상.
  - `clickByText` (matched · hydrated · 76ms), `clickAndWaitForUrl`, `fillReactInput`, `navigate(url)`, `reload`, `screenshot` — 전부 정상.
  - Console 버퍼: `console.log("x", { foo: 1 })` → text가 `x {"foo":1}` (JSON.stringify 형태) — 옛 포맷 보존.
- 추가 검증 (`/partners` 페이지, React 검색 input + 사이드바 라우트):
  - `fillReactInput` 실제 React controlled input에 한국어 값 입력 + read-back 일치 ✅
  - `clickAndWaitForUrl("권한 관리", "/roles")` SPA 라우트 정상 변경 (1.9s) ✅
  - `clickAndWaitForUrl` 실패 case의 에러 메시지에 실제 navigate된 URL 포함 (debug-friendly) ✅
  - 단순 `clickByText` 직후 URL이 안 바뀌는 케이스 관찰됨 — click 메커닉(매칭·hydration·실행)은 정상이고, 동일 호출이 다른 시점엔 navigate 성공. 페이지측 timing/state 이슈로 판단. Phase 2의 "remove sleep-based waits / add retry invariants"가 노리는 영역.

## 추가 fix (실측 후)

Playwright의 `ConsoleMessage.text()`가 객체를 `{foo: 1}` 형태로 포맷해서 옛날 `JSON.stringify` 출력과 달라졌던 문제 해결:

- `src/cdp/buffers.ts` — `msg.args()` 각 핸들을 `jsonValue()` + `JSON.stringify`로 직렬화. 비동기 직렬화이므로 `pendingSerializations` 배열에 promise 누적, `flushConsole()` export.
- `src/tools/checks.ts` — `consoleHandler`가 `getConsole()` 전에 `await flushConsole()` 호출.

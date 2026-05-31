# Phase 8 — Interaction Primitives (B+D)

**작성일: 2026-05-31**

`browser_eval`로 떠넘기던 액션(타이핑·클릭·드롭다운 선택)을 5개의 전용 MCP tool로 흡수. 내부 `safeFill` / `safeClick` 인프라가 이미 있었지만 `runtime/tasks/runner.ts`에서만 쓰이고 외부에 노출되지 않았던 갭을 메움.

## 배경

`/notice/management` 페이지(Radix Select + React controlled input)를 검증하는 도중 두 가지 실패 패턴이 반복 발생:

1. **Radix Select 드롭다운이 `el.click()`만으로 안 열림** — pointerdown → mousedown → pointerup → mouseup → click 풀시퀀스가 필요.
2. **React controlled input의 값 클리어가 `setter('')` + 일반 `Event('input')` 으로 안 됨** — `InputEvent('input', { inputType: 'deleteContentBackward' })` 형태까지 흉내내야 React가 인식.

두 패턴 모두 프로젝트 특성이 아니라 **시장점유율 압도적인 라이브러리/프레임워크 단의 광범위한 quirk**. `evaluate()` 만 노출하는 구조에선 LLM이 매번 시행착오로 재발견해야 함 → 누적 비용 큼.

## 추가된 MCP Tool (5개)

`src/tools/actions.ts` 신설, `src/server.ts`에 5개 등록.

| Tool | Args | 내부 호출 | 역할 |
|---|---|---|---|
| `browser_fill` | `selector`, `value` | `fillReactInput` → `safeFill` | React controlled input 안전 입력. Playwright `locator.fill()` 후 finalValue 불일치 시 native setter + bubbling input/change events fallback |
| `browser_click` | `selector` OR `text` | `safeClick` / `clickByText` | `el.click()` 기반 — Radix/Headless UI 포털 안의 요소도 React onClick 트리거 |
| `browser_press_key` | `key`, `selector?` | `locator.press()` / `page.keyboard.press()` | Enter / Escape / Tab / 방향키 등 W3C 키 이름 |
| `browser_select_option` | `triggerSelector` OR `triggerText`, `optionText` | `safeClick` 2회 + `waitFor(listbox)` | Radix Select / Headless UI Listbox / shadcn Select 통합 — 트리거 열고 옵션 클릭 |
| `browser_navigate` | `url`, `timeoutMs?` | `navigate` (`page.goto`) | `browser_eval` 안에서 `location.href` 쓸 때 발생하는 "Execution context destroyed" 회피 |

총 MCP tool 개수: **14 → 19**.

## 설계 원칙

### "React 친화"가 아닌 "안전한 기본 동작"

React-specific 분기 코드 없음. 단지 **실제 사용자의 키보드/마우스에 가장 가까운 이벤트 시퀀스**를 기본값으로:

- 클릭은 `el.click()` 직접 호출 (Playwright 좌표 클릭이 portal 안 요소에서 누락되는 문제 회피)
- 입력은 Playwright `locator.fill()` 우선, 실패 시 React가 인식 가능한 native setter + bubbling events fallback
- 결과적으로 React·Vue·Svelte·바닐라 어디서나 통과

### `browser_eval` escape hatch는 유지

새 도구는 **자주 쓰는 5개 케이스를 흡수**할 뿐, 표현 불가능한 raw 인스펙션은 여전히 `browser_eval` 사용. 도구 surface가 폭증하지 않도록 의도적으로 좁힘.

### CDP attach 모드 호환

플러그인은 `chromium.connectOverCDP`로 이미 켜진 Chrome에 붙는 모드. 새 tool들은 이미 검증된 내부 헬퍼(`safeFill`, `safeClick`)를 그대로 wrapping하므로 CDP attach 환경의 미묘한 제약(auto-wait 일부 제한)에 추가 노출 없음.

## 트레이드오프

- **MCP description 토큰 ↑** — 5개 tool description이 LLM 컨텍스트에 추가. 대신 매 검증마다 `evaluate()` IIFE 길이가 짧아지므로 평균적으로 상쇄 가능.
- **유지보수 surface ↑** — 5개 새 핸들러 + server.ts switch case 5개. 대부분 기존 내부 함수의 얇은 wrapper라 부담 작음.
- **`browser_select_option`의 ARIA 가정** — `[role=combobox]` 트리거 + `[role=option]` 옵션 패턴을 가정. Radix·Headless UI·shadcn은 모두 ARIA 준수, MUI Select도 OK. 네이티브 `<select>`는 대상 외(별도 노트 추가).

## 미적용 (의도적)

- **C: UI 라이브러리 빌트인 task** (Radix Select typeahead, MUI Autocomplete 비동기 옵션 로딩 등 까다로운 패턴 전용) — B+D 출시 후 실사용 데이터 보고 결정. 필요 시 별도 패키지(`@browser-verifier/ui-patterns`)로 분리 고려.
- **React-specific 분기** — 의도적으로 피함. 라이브러리 진화 (Radix v2, Ark UI, React Compiler 등) 따라 깨질 부채.

## 검증

`/notice/management` 페이지(Radix Select 상태 필터 + React controlled input 검색)에서 5개 시나리오 전부 통과 (2026-05-31).

| # | 시나리오 | 사용 도구 | 결과 |
|---|---|---|---|
| 1 | 검색어 "테스트" 입력 | `browser_fill` + `browser_press_key("Enter")` | 3건 (1001테스트 / 0912 공지테스트 / 등록테스트), URL `?search=테스트` ✅ |
| 2 | 검색어 클리어 (빈 입력 + Enter) | `browser_fill` + `browser_press_key("Enter")` | URL `search` 파라미터 제거됨, 5건 복원 ✅ |
| 3 | 상태 = 진행중 | `browser_select_option` (triggerText) | 2건, 모두 진행중, URL `?status=ONGOING` ✅ |
| 4 | 상태 = 완료 | `browser_select_option` (triggerText 갱신) | 3건, 모두 완료, URL `?status=ENDED` ✅ |
| 5 | 결합 (완료 + "등록") | `browser_fill` + `browser_press_key` | 1건 (등록테스트만), URL `?status=ENDED&search=등록` ✅ |

### Phase 8 적용 전후 비교

동일 시나리오를 Phase 8 적용 전 `browser_eval`로만 진행한 결과 대비:

| 항목 | Before (`browser_eval` only) | After (Phase 8 도구) |
|---|---|---|
| 총 elapsed | ~25s | ~6s |
| Radix Select 열기 | 풀 pointer 시퀀스 IIFE (~400ms) + 재시도 1회 | `browser_select_option` 100~174ms 단콜 |
| 검색어 클리어 | `setter('')` + `Event('input')` 실패 → `location.href` 전체 리로드 (~1.5s) | `browser_fill("")` + `browser_press_key("Enter")` 단콜 (~60ms) |
| MCP 콜 수 | 10+ (eval IIFE 다회 포함) | 13 (eval은 결과 확인용만) |
| LLM이 작성한 JS 코드 라인 | ~150 줄 (pointer 시퀀스 / InputEvent 흉내) | ~10 줄 (결과 확인 IIFE만) |

### 검증된 동작

- `browser_fill` — Playwright `locator.fill()` 1차 시도로 충분 (React fallback 트리거 안 됨, controlled input 정상 처리됨)
- `browser_press_key` — selector 지정으로 input에 focus 보장된 Enter dispatch → 검색 submit 정상
- `browser_select_option` — Radix Select(`button[role="combobox"]` 트리거 + portal `[role="option"]`) 통합 1콜 처리. 트리거 텍스트가 선택 후 옵션 텍스트로 바뀌어도(`상태 전체` → `진행중` → `완료`) triggerText 갱신으로 추적 가능
- `browser_navigate` — `location.href` 우회 (Execution context destroyed 에러 회피) 정상 동작

## 변경 파일

## 변경 파일

- `src/tools/actions.ts` (신규)
- `src/server.ts` (import + tools 배열 + switch case 5개 추가)
- `docs/refactor-phase-8.md` (본 문서)

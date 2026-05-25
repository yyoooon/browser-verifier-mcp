# Phase 3 — Semantic State

리팩터 3단계. raw DOM 추론 대신 bounded한 semantic 신호로 페이지 상태를 표현.

## 목표

- 한 번의 `page.evaluate` 호출로 페이지 핵심 상태를 컴팩트한 JSON으로 추출.
- generic — 앱 특화 selector 없음. React + Next.js + shadcn/Radix 패턴 대응.
- 19개 raw 툴과 공존. Phase 6에서 표면 축소.

## 추가 사항

### `src/runtime/semantic/extractSemanticState.ts`

단일 `extractSemanticState(page)` 함수가 다음을 반환:

```ts
interface SemanticState {
  route: string;        // location.pathname
  search: string;       // location.search
  hash: string;         // location.hash
  title: string;        // document.title (cap 80)
  loading: boolean;     // skeleton / spinner / aria-busy / progressbar 감지
  loadingHints: string[];
  modal: { title: string; visible: boolean } | null;
  primaryCTA: { text: string; visible: boolean; enabled: boolean } | null;
  headings: string[];   // 최대 5개 h1/h2
  errors: string[];     // role=alert / aria-live=assertive / destructive 등
  inputCount: number;   // 표시된 input/textarea/select 개수
  focusedElement: { tag: string; text: string } | null;
  elapsedMs: number;
}
```

추출 로직은 self-contained 한 in-page 함수 (`extractInPage`)로 `page.evaluate`에 넘김. 외부 closure 의존 없음.

### `src/tools/semantic.ts` + `browser_semantic_state` MCP 툴

LLM이 `browser_eval`을 여러 번 호출하는 대신 한 번에 페이지 상태를 받아갈 수 있도록 노출. 입력 스키마 없음(빈 객체). Generic.

`src/server.ts`에 등록.

## 휴리스틱 결정

### Loading 감지
신호: `[aria-busy=true]`, `[role=progressbar]`, `[class*=skeleton i]`, `[class*=spinner i]`. boolean + 어떤 신호가 켜졌는지 hints 배열로 반환.

### Modal 감지
`dialog[open]`, `[role=dialog]`, `[role=alertdialog]`. shadcn/Radix의 `data-state="open"`도 인정.

### Primary CTA
3단계 휴리스틱:

1. **landmark 제외**: `<nav>`/`<aside>`/`<footer>` 및 role=navigation/complementary/contentinfo 안의 버튼은 제외. `<header>`는 포함 — 페이지 헤더에 CTA가 자주 위치함.
2. **pagination 제외**: aria-label/text가 `Go to next/previous/first/last page` 패턴인 버튼은 제외.
3. **qualifying 조건**: 후보가 *(a) form에 연결된 `type=submit` 버튼* 또는 *(b) primary action 키워드 매칭* 둘 중 하나여야 함.

Primary action 키워드: `save/submit/create/add/confirm/send/apply/등록/저장/확인/추가/신청/전송/수정/삭제/완료`.

스코어: submit +60, primary 키워드 +50, secondary 키워드(next/back/검색/다음/이전) +15, BUTTON tag +5, area 비례 +0~20.

Modal이 열려있으면 scope를 modal 내부로 자동 전환.

### 발견된 함정

- **HTMLButtonElement.type은 명시적 attribute가 없어도 기본값이 `"submit"`**. 따라서 `el.type === "submit"`만 검사하면 모든 `<button>`이 submit으로 잘못 인식됨. fix: `el.type === "submit" && el.form !== null` — 실제 form에 연결된 경우만.

## 검증 — 2026-05-25

dev 서버 localhost:3000 4개 라우트:

| 라우트 | primaryCTA | modal | inputCount | headings 0번째 |
|---|---|---|---|---|
| /partners | "제휴업체 등록" | null | 1 | 제휴업체 관리 |
| /dashboard/health | null (대시보드 CTA 없음 — 정확) | null | 0 | 대시보드 |
| /admin-account | "관리자 등록" | null | 1 | 관리자 계정 관리 |
| /roles | "저장" | null | 0 | 권한 관리 |

모달 시나리오 — `/partners`에서 "제휴업체 등록" 클릭 후 800ms 대기:

```json
{
  "modal": { "title": "제휴업체 등록", "visible": true },
  "primaryCTA": { "text": "부서/조직 추가", ... },
  "inputCount": 3,
  "focusedElement": { "tag": "INPUT", "text": "" }
}
```

scope가 modal로 자동 전환되고, modal 내부 액션이 primaryCTA로 잡힘.

추출 시간: 4-11ms 범위.

## 남긴 부분 (의도적)

- **MCP 19개 raw 툴 그대로** — Phase 6에서 의도적으로 축소.
- **SKILL.md / agents 수정 안 함** — `browser_semantic_state`를 SKILL.md 툴 목록에 추가하는 건 Phase 6 같은 surface-narrowing 결정과 같이 가는 게 깔끔.
- **flow-compiler 미수정** — Phase 1 결정 그대로. Phase 5에서 verification graph 도입 시 재평가.

## Phase 3 종료 상태

- runtime primitives: `client`, `safeClick`, `safeFill`, `waitPageStable`, `waitRouteChange`, `extractSemanticState`.
- MCP 툴 20개 (기존 19 + `browser_semantic_state`).
- `tsc` 통과, 라이브 검증 통과.

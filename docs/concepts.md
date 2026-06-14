# 이 프로젝트를 이해하기 위한 가이드

> AI · 브라우저 자동화 · MCP를 처음 다루는 사람도 따라올 수 있게 적은 개념 정리. **각 용어는 처음 등장할 때 설명을 붙임.**
>
> 이 문서를 다 읽고 나면:
> - 이 프로젝트가 "왜" 이런 구조인지 설명할 수 있음
> - AI에게 어디까지 시켜도 되고, 어디부터는 도구에게 시켜야 하는지 판단 가능
> - 다른 사람한테 "이거 뭐 하는 거야?" 했을 때 한 문단으로 답할 수 있음

---

## 0. 이 프로젝트 한 줄 요약

> **개발 중인 웹앱이 의도대로 동작하는지를 AI가 결정적으로 검증하게 해주는 다리(bridge).**

다리의 한쪽엔 AI(Claude Code), 다른 쪽엔 브라우저(Chrome)가 있다. 다리 위에 20개의 도구가 놓여 있고, AI가 그 도구들을 "골라서 써"서 브라우저 상태를 본다.

---

## 1. LLM(대형 언어 모델) 기초

### 1.1 LLM이 뭔가

**LLM (Large Language Model)** — Claude, GPT 같은 거. 기본 동작은 한 줄로 요약 가능:

> **이전 텍스트를 보고, 다음에 올 가장 그럴듯한 단어(토큰)를 확률적으로 예측한다.**

"이해"하는 게 아니라 "패턴 매칭". 인터넷의 거대한 텍스트를 학습해서, 비슷한 맥락에서 사람이 어떤 단어를 썼는지를 통계적으로 안다.

### 1.2 핵심 용어

- **토큰(token)**: 단어보다 살짝 더 잘게 쪼갠 단위. 영어는 보통 단어 ≈ 1-2 토큰, 한국어는 글자 ≈ 1-2 토큰. "안녕하세요" 같은 짧은 인사도 5개 정도. LLM의 입출력은 토큰 단위로 셈한다.

- **context window**: LLM이 한 번에 볼 수 있는 토큰의 총량. Claude는 200,000 토큰 이상. 이 한계를 넘으면 옛날 내용은 "잊는다". 긴 대화에서 처음 대화가 사라지는 이유.

- **prompt**: LLM에게 주는 입력 전체. 사용자 메시지 + 시스템 지침 + 이전 대화 기록.

- **system prompt**: 사용자가 안 보지만 LLM에게 매번 주는 지침 ("너는 친절한 어시스턴트야"). Claude Code의 `CLAUDE.md` 같은 게 여기 들어간다.

- **temperature**: 답변의 "창의성" 다이얼. 0이면 매번 같은 답, 1이면 매번 약간 다른 답. 검증 같은 결정성이 중요한 일엔 0이 좋음.

### 1.3 LLM이 잘하는 것

- **언어 이해/생성**: 한국어, 영어, 코드 다 자연스럽게 다룸
- **패턴 적용**: "이거랑 비슷한 거 또 해줘"
- **코드 작성/리뷰**: 본 적 있는 패턴이면 능숙
- **요약/번역/형식 변환**: 입력을 다른 모양으로 바꾸기
- **추론**: 짧은 단계의 논리적 추론

### 1.4 LLM이 못하는 것 (한계)

#### 결정성(determinism) 부재
같은 질문을 두 번 해도 답이 살짝 다르다. 텍스트 생성이 본질적으로 확률적이기 때문. temperature를 0으로 줘도 완벽히 같진 않음.

→ **이게 검증 자동화에서 가장 큰 문제.** "이 페이지 잘 떴어?"라는 같은 질문에 첫 번째는 "잘 떴음", 두 번째는 "에러 있는 듯"이 나올 수 있다.

#### Hallucination(환각)
모르는 걸 모른다고 안 하고, 그럴듯하게 지어낸다. 예: "그 라이브러리에 `unstable_useFancy()` 함수 있어요" → 사실 없음.

#### 실시간 외부 상태 모름
LLM이 학습한 시점 이후의 정보는 모름. 그리고 "지금 이 페이지에 뭐가 떠 있는지"는 도구로 봐야만 안다. **그래서 MCP 같은 도구 호출 시스템이 필요함.**

#### 정밀 수치/계산
큰 곱셈, 픽셀 단위 측정, 시간 측정 같은 건 신뢰 X. 계산기 / 도구를 써야 한다.

#### Token 한계
컨텍스트가 커지면 처음 정보가 잊힌다. 매번 같은 정보를 반복하면 토큰 낭비. **그래서 결정적인 작업은 코드로 박는 게 낫다 — 매번 LLM에게 설명 안 해도 됨.**

#### 한 번에 본 것만 사용
LLM은 메시지 단위로 동작. 메시지 사이에 학습이 일어나지 않음. 새 대화 시작하면 백지.

### 1.5 왜 verification(검증)에서 이 한계가 치명적인가

검증의 본질은 **"PASS인지 FAIL인지 명확히 답하기"**.

- "잘 됐어 보여요" ❌ — 모호함
- "에러 없는 것 같아요" ❌ — 추측
- "이 className이 박혔고, 컴퓨티드 색이 rgb(214, 234, 250)" ✅ — 결정적

LLM 혼자에게 "검증해줘" 시키면:
1. 페이지 보고 (`browser_eval` 같은 raw 도구로 DOM dump)
2. 본 걸 "추론"해서 답함
3. 1회차에 PASS, 2회차에 FAIL 같은 결과 가능

해결책은 **결정성을 코드에 박고, LLM은 "무엇을 확인할지"만 결정하게** 하는 것. 이 프로젝트의 핵심 철학.

---

## 2. 브라우저 조작 원리

### 2.1 웹 페이지 구성

- **HTML (HyperText Markup Language)**: 페이지의 구조. `<button>`, `<input>`, `<div>` 같은 태그로 만들어진 트리.
- **CSS (Cascading Style Sheets)**: 모양. 색, 크기, 위치.
- **JavaScript (JS)**: 동작. 클릭하면 뭐가 일어날지.

### 2.2 DOM(Document Object Model)

브라우저가 HTML 텍스트를 파싱해서 메모리에 만든 **객체 트리**. JS가 이걸 통해 페이지를 조작함:

```js
const button = document.querySelector("button.submit");  // 버튼 찾기
button.click();                                          // 클릭
button.style.color = "red";                              // 색 바꾸기
```

DOM은 "지금 이 순간"의 페이지 상태. HTML이 정적이라면 DOM은 동적.

### 2.3 SPA(Single Page Application)와 React

옛날 웹은 페이지 이동마다 새 HTML을 받았다. 요즘은:

- **SPA**: 처음에 한 번 HTML/JS를 받고, 이후엔 JS가 DOM을 동적으로 바꾸면서 "페이지가 바뀐 것처럼" 보이게 함. URL은 history API로 바꿈.
- **React**: 페이스북이 만든 UI 라이브러리. "컴포넌트"를 선언적으로 짜면 React가 DOM을 알아서 만들고 업데이트.
- **Next.js**: React 위에 라우팅, 서버 렌더링 등 추가한 프레임워크.

이 프로젝트의 dev 서버는 Next.js. 이게 중요한 이유:

### 2.4 Hydration(하이드레이션)

Next.js는 서버에서 HTML을 미리 만들어서 보낸다 (빠른 첫 페인트). 그 다음 클라이언트에서 React가 그 HTML 위에 **이벤트 핸들러를 붙인다**. 이 과정이 hydration.

문제: hydration 끝나기 전엔 버튼이 "보이지만 클릭 안 됨". 너무 빨리 클릭하면 무시당함.

→ 이 프로젝트의 `safeClick`이 "React fiber" 키 (`__reactFiber*`)가 element에 붙었는지 검사해서 hydration 완료를 기다리는 이유.

### 2.5 어떻게 다른 프로그램이 브라우저를 조작하나

옛날엔 OS의 마우스/키보드를 흉내냈다 (Selenium 같은). 느리고 불안정.

요즘은 **CDP(Chrome DevTools Protocol)**. Chrome이 자기 자신을 다른 프로그램이 조작할 수 있게 열어둔 통신 채널.

#### Chrome --remote-debugging-port

Chrome을 이렇게 띄움:
```bash
chrome --remote-debugging-port=9223
```

→ Chrome이 `localhost:9223`에서 WebSocket 서버를 연다. 다른 프로그램이 거기 붙어서 명령을 보내면 Chrome이 실행:

- `Page.navigate({url})` → 페이지 이동
- `Runtime.evaluate({expression})` → JS 실행
- `Page.captureScreenshot()` → 스크린샷
- 등등 수백 개의 명령

### 2.6 Playwright — CDP 위의 추상화

CDP는 강력하지만 raw. 매번 메시지 보내고 응답 기다리고 에러 처리하기 귀찮음.

**Playwright**는 Microsoft가 만든 라이브러리. CDP를 깔끔하게 감쌌고 거기에 "스마트한 기능"을 더했다:

- **자동 대기**: `locator.click()` 호출하면 element가 "click 가능" 상태(보이고, 안 가려졌고, 이벤트 받음)가 될 때까지 자동으로 기다림
- **Locator**: element를 "지금 이 순간의 ref"가 아니라 "조건"으로 표현. React가 element를 다시 그려도 locator는 새 element를 자동으로 찾음
- **자동 retry**: 일시적 실패는 자동 재시도

#### chromium.connectOverCDP()

Playwright는 기본적으로 자기가 Chrome을 직접 실행함. 하지만 우리는 **이미 떠 있는** Chrome에 붙고 싶음 (사용자가 보던 페이지 그대로). 그래서:

```ts
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
```

이 한 줄이 이 프로젝트의 핵심 진입점. "기존 Chrome에 붙어서 그 Page를 가져온다."

---

## 3. MCP (Model Context Protocol)

### 3.1 왜 만들어졌나

LLM이 진짜 유용하려면 **도구를 쓸 수 있어야** 함:
- 파일 읽기/쓰기
- 명령 실행
- API 호출
- ... 그리고 브라우저 조작

옛날엔 각 LLM 클라이언트(ChatGPT 플러그인, 어떤 IDE, 어떤 챗봇)가 다 다른 방식으로 도구를 연결. 도구 만드는 사람이 N개 클라이언트에 N번 연동해야 함.

**MCP**는 Anthropic이 2024년에 발표한 표준. **JSON-RPC 기반의 도구 호출 프로토콜.** Claude만 쓰는 게 아니라 다른 LLM 도구도 채택 중.

### 3.2 구조

```
┌──────────────┐      JSON-RPC      ┌──────────────┐
│   Client     │ ←─────────────────→ │   Server     │
│ (Claude Code)│      over stdio     │ (이 프로젝트) │
└──────────────┘                     └──────────────┘
       ↑                                    ↓
       │                                    ↓
       └─ "browser_setup 좀 써줘"     실제로 Chrome 조작
```

#### Client
LLM이 들어 있는 호스트. Claude Code, Claude Desktop, VS Code 같은 거.

#### Server
"도구"를 제공하는 프로세스. 이 프로젝트의 `dist/server.js`.

#### Transport
Client ↔ Server가 어떻게 메시지를 주고받는지.
- **stdio**: 표준 입력/출력. Server는 Client가 자식 프로세스로 띄움.
- **HTTP/SSE**: 원격 server일 때 (이 프로젝트는 stdio).

### 3.3 동작 흐름

```
1. Client가 Server 실행 (자식 프로세스로 띄움)
2. Client → Server: "tools/list" (어떤 도구 있어?)
3. Server → Client: [{ name: "browser_setup", description: ..., inputSchema: ... }, ...]
4. LLM이 사용자 요청 봄 ("이 페이지 검증해줘")
5. LLM이 tools 목록 보고 "browser_setup이 필요하네" 판단
6. Client → Server: "tools/call" with { name: "browser_setup", arguments: {...} }
7. Server가 실제로 도구 실행 (Chrome에 붙음)
8. Server → Client: { result: { port: 3000, ... } }
9. LLM이 결과 보고 다음 행동 결정 (예: "browser_verify 호출")
10. 반복
```

이 프로세스는 stdio로 한 줄씩 JSON을 주고받는다. Server는 죽지 않고 계속 떠 있으면서 명령을 받음.

### 3.4 이 프로젝트가 노출하는 15개 도구

각 도구는 `src/tools/*.ts`의 핸들러 함수. `src/server.ts`가 등록하고 dispatch.

- `browser_setup` — Chrome (기본 9223)에 연결
- `browser_semantic_state` — 페이지 상태 컴팩트하게
- `browser_inspect` — selector별 computed style / text / rect / classList / attr 일괄 **관찰** (expected 불필요)
- `browser_verify` — 다중 **assertion** (expected ↔ observed)
- `browser_run_task` — multi-step flow 실행 (내부 `cdp/actions`로 click/fill/navigate)
- ... (총 15개, 자세한 분류는 5.2 참고)

> 직접 조작 도구(`browser_fill / click / press_key / select_option / navigate`)는 본 MCP에서 제거됨. **검증 전용**으로 운영하며 조작은 외부(`agent-browser` 등)에 위임한다.

LLM은 이름과 description 보고 어떤 도구를 어떤 순서로 쓸지 스스로 결정.

---

## 4. 이 프로젝트가 풀려는 문제

### 4.1 개발자의 흔한 루프

```
1. 코드 수정
2. 브라우저로 가서 새로고침
3. 클릭, 폼 채우기
4. "잘 되네" 확인
5. 콘솔 에러 봄
6. 다시 코드로 돌아옴
```

매번 수동. 작은 변경이라도 이 루프를 안 돌리면 회귀(regression) 위험.

### 4.2 AI가 이걸 대신할 수 있나

가능하지만 **결정적으로 해야 함**. LLM 혼자에게 "잘 동작하는지 봐줘"라고 시키면:
- 결과가 매번 다름 (1.4의 한계)
- 무엇을 확인했는지 불명확
- 실패 시 원인 파악이 LLM의 추론에 의존

### 4.3 해결의 핵심 — "WHAT vs HOW" 분리

| 책임 | 누가 |
|---|---|
| **WHAT을 확인할지** ("login 후 dashboard로 가야 함") | LLM |
| **HOW로 확인할지** (hydration 대기, click retry, networkidle 검사, ...) | Runtime (코드) |

LLM은 명령을 내리고, 도구가 결정적으로 실행. **LLM이 자기 추론으로 timing 같은 걸 결정하지 않게 한다.**

이게 이 프로젝트의 핵심 설계 철학.

---

## 5. 이 프로젝트의 아키텍처

### 5.1 4-layer 구조

```
┌─────────────────────────────────────────────┐
│  Claude Code (LLM)                          │  ← "이 페이지 검증해줘" (자연어)
└─────────────────┬───────────────────────────┘
                  │ MCP (JSON-RPC over stdio)
                  ↓
┌─────────────────────────────────────────────┐
│  MCP Server (이 프로젝트, src/server.ts)    │  ← 20 도구 노출
│   ├─ src/tools/*.ts   (각 도구 핸들러)      │
│   └─ src/runtime/*.ts (Playwright primitive) │
└─────────────────┬───────────────────────────┘
                  │ Playwright API
                  ↓
┌─────────────────────────────────────────────┐
│  Playwright Library (npm)                   │  ← Locator, Page, ...
└─────────────────┬───────────────────────────┘
                  │ CDP (WebSocket)
                  ↓
┌─────────────────────────────────────────────┐
│  Chrome (--remote-debugging-port=9223)      │  ← 사용자가 보는 브라우저
└─────────────────────────────────────────────┘
```

명령은 위에서 아래로, 결과는 아래에서 위로 흐름.

### 5.2 20개 도구의 분류

- **Lifecycle** (3) — setup, tab_list, sentinel_save: 사이클 시작/끝 관리
- **Inspection** (4) — semantic_state, inspect, get_url, is_visible: 페이지 상태 읽기 (`inspect`는 computed style/text/rect/classList/attr 관찰, expected 불필요 — Phase 10)
- **Verification** (3) — verify, check_console, check_network: 명시적 검증 (assertion)
- **Interaction** (5) — fill, click, press_key, select_option, navigate: 입력 / 클릭 / 키 / Radix-style select / URL 이동 직접 발사 (Phase 8에서 surface로 올라옴)
- **Tasks** (3) — load_tasks, list_tasks, run_task: multi-step flow
- **Escape/Media** (2) — eval, screenshot: 위에서 표현 불가능한 경우

### 5.3 결정성을 어떻게 확보하나

#### Locator (Playwright)
element를 "ID"가 아니라 "조건"으로 표현. React가 element를 다시 그려도 locator는 새 element를 다시 찾아서 클릭.

```ts
const button = page.locator('[data-vb-click-target]').first();
await button.click();  // 클릭 시점에 다시 찾아서 클릭
```

#### Tag-and-retry
이 프로젝트의 `clickByText`는:
1. `findAndTag` 함수가 visible element 찾아서 `data-vb-click-target=""` 부여
2. Locator로 그걸 가리키고 `safeClick` 호출
3. 실패 시 다시 tag하고 한 번 더 시도

→ React rerender로 element가 사라져도 복구.

#### waitPageStable
페이지가 "안정"됐는지 확인:
- `domcontentloaded` — HTML 파싱 끝
- `networkidle` — 500ms 동안 네트워크 요청 없음
- `getAnimations()` — 진행 중인 애니메이션 없음

세 조건을 일정 시간 안에 모두 충족할 때까지 기다림. 안 되면 timeout.

#### Semantic state — 한 번에 전부
LLM이 페이지를 알기 위해 여러 번 `eval`을 호출하면 그 사이에 상태가 변할 수 있다. `extractSemanticState`는 **한 번의 `page.evaluate`**로 route, modal, primaryCTA, headings, errors 등 다 추출. snapshot의 일관성이 보장됨.

### 5.4 Task 시스템

#### 왜 만들었나
같은 검증 flow를 매번 LLM에게 재합성시키면:
- 토큰 낭비
- 매번 살짝 다른 결과 (LLM의 비결정성)
- 회귀 추적 어려움

→ **반복 가능한 flow를 JSON으로 굳혀서 결정적으로 실행.**

#### 두 모드
- **Named**: `.browser-verifier/tasks.json`에 정의 → `browser_run_task({ name })`
- **Inline**: `browser_run_task({ steps: [...] })` — 파일 없이 즉시 실행

inline 모드는 1회성 인터랙션+검증 mixed flow를 1콜로 처리하기 위해 추가됨 (Phase 8).

---

## 6. 코드 디렉토리 안내

```
src/
├── server.ts                    # MCP 진입점, 20 도구 등록 + dispatch
│
├── runtime/                     # Playwright 위에 만든 primitive
│   ├── client.ts                # connectOverCDP 싱글톤
│   ├── interaction/
│   │   ├── safeClick.ts         # Locator + scroll + visible + retry
│   │   └── safeFill.ts          # fill + React native setter fallback
│   ├── navigation/
│   │   ├── waitPageStable.ts    # networkidle + animations idle
│   │   └── waitRouteChange.ts   # page.waitForURL 래퍼
│   ├── semantic/
│   │   └── extractSemanticState.ts  # 한 번의 evaluate로 페이지 상태 dump
│   ├── verify/
│   │   ├── types.ts             # 11 check 타입 정의
│   │   └── runVerify.ts         # check dispatch (state + batched DOM)
│   ├── tasks/
│   │   ├── types.ts             # TaskOp, TaskDefinition, etc.
│   │   ├── registry.ts          # 로드된 task의 in-memory store
│   │   ├── loader.ts            # JSON 파일 → 검증된 task
│   │   └── runner.ts            # step 실행 (template substitution, bail-on-error)
│   └── screenshot.ts            # 캡처 inner 로직
│
├── tools/                       # MCP tool 핸들러 (얇은 wrapper)
│   ├── setup.ts
│   ├── eval.ts
│   ├── checks.ts                # console / network / get_url / is_visible
│   ├── tabs.ts
│   ├── sentinel.ts
│   ├── screenshot.ts
│   ├── semantic.ts
│   ├── verify.ts
│   └── tasks.ts                 # 3 task tool (load, list, run)
│
├── cdp/                         # Phase 1 이전부터 있던 layer (호환 유지)
│   ├── actions.ts               # clickByText, fillReactInput 등 — 내부는 Playwright
│   ├── wait.ts                  # waitForUrl 등 — 내부는 Playwright
│   ├── eval.ts                  # evalInBrowser — page.evaluate 사용
│   ├── buffers.ts               # console/network buffer — page.on() 사용
│   ├── client.ts                # runtime/client.ts에 대한 thin shim
│   ├── port.ts                  # dev 서버 port 자동 감지
│   └── target.ts                # /json/list로 Chrome target 찾기
│
└── lib/                         # 공통 유틸
    ├── result.ts                # { ok, fail } MCP 응답 헬퍼
    └── glob.ts                  # `**/dashboard` 같은 glob 매칭
```

### 6.1 데이터 흐름 예시

LLM이 `browser_verify({ checks: [...] })`를 호출했을 때:

```
1. Claude Code (Client) → stdio로 JSON 메시지 전송
2. src/server.ts가 CallToolRequest 받음
3. switch (name) { case "browser_verify": ... } → tools/verify.ts.handler 호출
4. handler가 ensureAttached() → 현재 Page 객체 가져옴
5. runVerify(page, checks) 호출
6. runtime/verify/runVerify.ts:
   a. extractSemanticState(page) → page.evaluate로 한 번에 페이지 상태 dump
   b. style/class checks 있으면 한 번 더 page.evaluate (batched DOM query)
   c. 각 check를 dispatch해서 PASS/FAIL 결정
7. handler가 ok(result) 또는 fail(message)로 MCP 응답 형식 만듦
8. server.ts가 그걸 stdio로 Claude Code에 반환
9. LLM이 결과 보고 다음 action 결정
```

각 step은 결정적. LLM은 "browser_verify를 이런 인자로 호출하자"만 결정하면 됨.

---

## 7. 헷갈리기 쉬운 것들

### 7.1 CDP vs Playwright vs MCP

세 단어가 자주 같이 나옴. 헷갈림 정리:

| 단어 | 정체 | 누가 만들었나 | 역할 |
|---|---|---|---|
| **CDP** | 통신 프로토콜 | Google (Chrome) | Chrome을 외부에서 조작 |
| **Playwright** | npm 라이브러리 | Microsoft | CDP를 깔끔하게 감싼 도구 |
| **MCP** | 통신 프로토콜 | Anthropic | LLM이 도구를 호출하는 표준 |

이 프로젝트는: **MCP** 서버다. 그 서버 내부는 **Playwright**를 쓴다. Playwright는 내부적으로 **CDP**로 Chrome과 통신한다.

### 7.2 server.ts vs tools/*.ts vs runtime/*.ts

| 파일 | 역할 | 예시 |
|---|---|---|
| `src/server.ts` | MCP 엔트리. 20 도구 등록 + dispatch | switch(name) { case "browser_X": handler() } |
| `src/tools/X.ts` | MCP tool 정의 + handler (얇은 wrapper) | description, inputSchema, ok/fail 응답 |
| `src/runtime/X.ts` | 실제 동작 로직 | Playwright API 호출, 검증 dispatch |

→ **tools layer는 MCP 형식에 맞추는 어댑터**. runtime layer가 실제 일을 함. 분리한 이유: runtime을 다른 곳에서 재사용 가능 (예: task runner가 runtime 함수들을 직접 호출).

### 7.3 task vs check vs op

| 용어 | 정체 | 어디 |
|---|---|---|
| **op** | task의 한 step (`{ op: "click", text: "..." }`) | tasks runner |
| **check** | verify의 한 assertion (`{ type: "no_errors" }`) | verify runtime |
| **task** | op들의 sequence + 메타데이터 | `.browser-verifier/tasks.json` |

verify는 **단일 시점에 여러 사실을 동시에 검사**. task는 **시간 순서대로 여러 동작 + 검사를 묶음**.

### 7.4 결정성(determinism) vs 안정성(stability) vs 정확성(correctness)

- **결정성**: 같은 입력에 항상 같은 출력. (이 프로젝트의 목표)
- **안정성**: 변동이 적음. flaky하지 않음.
- **정확성**: 사실과 일치. correct.

LLM은 정확할 수 있어도 결정적이지 않을 수 있음. 이 프로젝트는 LLM의 비결정성을 코드의 결정성으로 감싸서 verification에 적합하게 만듦.

---

## 8. 자주 나오는 용어 사전 (알파벳순)

- **agent**: LLM이 자율적으로 행동하는 시스템. 도구를 골라 쓰고, 결과 보고 다음 행동 결정.
- **API (Application Programming Interface)**: 프로그램끼리 통신하는 약속. 예: 함수 시그니처, HTTP endpoint.
- **CDP (Chrome DevTools Protocol)**: Chrome을 외부에서 조작하는 프로토콜. WebSocket 기반.
- **CLI (Command Line Interface)**: 명령어로 쓰는 프로그램. 예: `npm`, `git`.
- **client/server**: 요청하는 쪽(client) / 응답하는 쪽(server). MCP에서 Claude Code가 client, 이 프로젝트가 server.
- **commit**: git에서 변경을 기록하는 단위.
- **computed style**: 브라우저가 CSS 규칙 적용 후 계산한 최종 스타일. `#fff` 같은 hex가 `rgb(255, 255, 255)`로 normalize됨.
- **dependency**: 다른 라이브러리에 의존. `package.json`의 `dependencies` 필드.
- **dev server**: 개발용 웹 서버. `yarn dev`, `npm run dev`로 실행되는 거.
- **DOM (Document Object Model)**: 브라우저 메모리 안의 페이지 객체 트리.
- **dispatch**: 들어온 요청을 적절한 핸들러로 분배.
- **environment variable (env var)**: 프로세스에 주는 설정값. 예: `VERIFIER_TASKS_PATH`.
- **ES module (ESM)**: JS의 모듈 시스템. `import` / `export` 키워드. CommonJS(`require`)와 대조.
- **flaky**: 같은 테스트가 때로는 PASS 때로는 FAIL — 신뢰 불가.
- **glob**: 와일드카드 패턴. `**/dashboard`는 "어떤 경로든 끝이 /dashboard".
- **handler**: 요청을 받아 처리하는 함수.
- **hydration**: server-rendered HTML에 React가 이벤트 핸들러 붙이는 과정.
- **IIFE (Immediately Invoked Function Expression)**: `(() => { ... })()` 형태. 함수 정의 후 즉시 실행.
- **inline**: 별도 파일/이름 없이 그 자리에 직접. (e.g. inline steps = 파일 없는 task)
- **JSON-RPC**: JSON으로 함수 호출하는 프로토콜. MCP의 기반.
- **Locator (Playwright)**: element를 "조건"으로 표현한 객체. 사용 시점에 다시 찾음.
- **MCP (Model Context Protocol)**: LLM이 도구를 호출하는 표준 프로토콜. Anthropic.
- **module**: 재사용 가능한 코드 단위.
- **node_modules**: npm이 설치한 dependency가 들어가는 디렉토리.
- **npm (Node Package Manager)**: JS 패키지 관리자.
- **OKLCH**: 색 표현법 중 하나. Tailwind v4가 사용. rgb()와 다름.
- **Playwright**: Microsoft의 브라우저 자동화 라이브러리. CDP 위의 추상화.
- **prompt**: LLM에게 주는 입력.
- **protocol**: 통신 약속.
- **React fiber**: React 내부의 element 표현. element에 `__reactFiber*` 키로 박힘.
- **regression**: 회귀. 이전에 잘 되던 게 다시 깨짐.
- **roundtrip**: 요청 보내고 응답 받는 한 사이클.
- **selector**: CSS 셀렉터. 예: `button.submit`, `[data-slot=card]`.
- **SPA (Single Page Application)**: 페이지 새로고침 없이 동작하는 웹앱.
- **stabilize**: 페이지가 안정 상태(애니메이션 끝, 네트워크 idle 등)로 들어가게 기다림.
- **stdio**: standard input / output. 프로세스의 기본 입출력 채널.
- **stale**: 오래되어 더 이상 유효하지 않음. DOM element가 detach되면 stale.
- **token**: LLM이 처리하는 텍스트의 최소 단위.
- **transport**: 프로토콜의 운반 채널. MCP에선 stdio 또는 HTTP/SSE.
- **TypeScript (TS)**: JS에 타입 시스템 추가한 언어. 빌드 시 JS로 컴파일.
- **WebSocket**: 양방향 실시간 통신 프로토콜. CDP가 사용.

---

## 9. 마지막으로 — 이 프로젝트를 다른 사람한테 설명하라면

> "Claude 같은 LLM이 개발 중인 웹 페이지를 결정적으로 검증하게 해주는 MCP 서버야.
>
> Chrome을 디버깅 모드(9223)로 띄워두면, 이 서버가 Playwright를 통해 거기 붙어서 페이지 상태를 구조화된 JSON으로 LLM에 전달해. LLM은 'route가 /dashboard인지, 에러 없는지, 이 버튼 텍스트가 맞는지' 같은 걸 도구 호출로 확인.
>
> 핵심 철학은 'LLM은 WHAT만 결정, HOW는 코드가 결정적으로 처리'야. timing이나 React hydration 같은 까다로운 부분은 runtime이 알아서 하고, LLM은 비결정성을 일으킬 수 있는 영역에 안 끼어들어."

이 한 문단이 머리에서 자연스럽게 나오면 이 프로젝트를 이해한 것.

---

## 더 공부할 거리

- **MCP 공식 사이트**: https://modelcontextprotocol.io
- **Playwright 공식**: https://playwright.dev
- **Chrome DevTools Protocol**: https://chromedevtools.github.io/devtools-protocol
- **React 공식**: https://react.dev
- **Anthropic Claude 가이드**: https://docs.anthropic.com

# browser-verifier-mcp

> 이 문서 하나로 ① 처음 보는 동료에게 소개하고, ② 소개 후 어떤 질문이 와도 답할 수 있게 만드는 것이 목표.
> 순서대로 읽으면 "왜 → 무엇 → 어떻게 → 비교 → 예상 질문" 흐름으로 이해가 쌓인다.
>
> 설치·셋업·도구 레퍼런스 등 실무 내용은 [예상 질문](#8-예상-질문--답변) 아래 [실무 가이드](#실무-가이드--설치--셋업--레퍼런스)에 있다.

---

## 목차

1. [30초 소개 (엘리베이터 피치)](#1-30초-소개-엘리베이터-피치)
2. [왜 필요한가 — 문제 정의](#2-왜-필요한가--문제-정의)
3. [핵심 설계 철학 — WHAT과 HOW의 분리](#3-핵심-설계-철학--what과-how의-분리)
4. [무엇을 할 수 있나 — 기능 전체](#4-무엇을-할-수-있나--기능-전체)
5. [어떻게 구현되어 있나 — 아키텍처](#5-어떻게-구현되어-있나--아키텍처)
6. [다른 도구와 뭐가 다른가 — 비교](#6-다른-도구와-뭐가-다른가--비교)
7. [한계 — 못 하는 것](#7-한계--못-하는-것)
8. [예상 질문 & 답변](#8-예상-질문--답변)

---

## 1. 30초 소개

> **"코드 고친 뒤 브라우저 가서 눈으로 확인하는 일을, Claude가 대신 — 그것도 매번 똑같은 결과로 — 하게 해주는 MCP 서버입니다.**
>
> AI에게 화면을 통째로 주고 '잘 됐는지 봐줘'라고 하면 판단이 매번 흔들리고 토큰도 많이 씁니다. 이 도구는 반대로, AI는 **'무엇을 확인할지'만 지정**하고 실제 확인(요소 읽기, 로딩 대기, 값 비교, 합격 판정)은 **미리 만들어둔 코드가 기계적으로** 합니다. 그래서 결과가 결정적(deterministic)이고, 빠르고, 가볍습니다."

**한 단어 비유: 자동 채점기(OMR).** 화면 전체를 AI가 눈으로 읽고 채점하는 게 아니라, "몇 번 칸을 볼지"만 정해주면 기계가 정해진 칸만 읽어 정답지와 대조한다.

---

## 2. 왜 필요한가 — 문제 정의

### 2-1. 개발자의 반복 루프

웹 개발의 일상은 이 루프의 무한 반복이다:

```
코드 수정 → 브라우저 새로고침 → 해당 페이지로 이동
→ 버튼 눌러보고 폼 채워보고 → "잘 되네" / "콘솔 에러네" → 다시 코드로
```

AI 코딩 도구(Claude Code 등)를 써도 이 루프의 후반부(브라우저 확인)는 여전히 사람 몫이다. AI는 코드는 고쳐주지만 **내 브라우저를 볼 수 없기 때문**이다. "적용됐는지 봐줘"라고 하면 "코드상으로는 맞아 보이니 브라우저에서 확인해주세요"라는 답이 돌아온다.

### 2-2. AI에게 그냥 브라우저를 쥐여주면 안 되나?

가능하다. Playwright MCP 같은 도구가 이미 그렇게 한다. 하지만 **검증(verification)** 용도로는 두 가지 근본 문제가 있다:

**① LLM은 비결정적이다.** LLM의 본질은 확률적 텍스트 생성이라 같은 화면을 두 번 보여줘도 "잘 됐다" / "에러 있는 것 같다"로 답이 갈릴 수 있다. 검증의 본질은 "PASS냐 FAIL이냐를 명확히 답하기"인데, 판정 주체가 흔들리면 검증이 아니다. 어제 통과한 게 오늘 깨지는 flaky가 도구 차원에서 내장되는 셈이다.

**② 화면 전체를 읽는 건 비싸다.** 접근성 트리나 스크린샷을 통째로 AI에게 주면 매번 수천~수만 토큰을 소모하고, 느리다. 확인하고 싶은 건 "카드 배경색이 rgb(214, 234, 250)인가" 하나인데 화면 전체를 읽는 것은 낭비다.

**③ 정밀 값 판정이 불가능하다.** 접근성 트리에는 CSS px·색상 값이 거의 안 나온다. "마진이 정확히 16px인가", "폰트 굵기가 500인가" 같은 판정은 눈대중으로는 못 한다.

### 2-3. 그래서 이 도구가 하는 일

AI와 브라우저 사이에 **결정적 검증 레이어**를 끼워 넣는다. AI는 "이 selector의 이 값이 이래야 한다"고 지정만 하고, 읽기·대기·비교·판정은 검증된 코드가 수행한다. 결과는 `expected vs observed` 구조화 JSON으로 돌아오고, 같은 검증은 언제 돌려도 같은 결과가 나온다.

---

## 3. 핵심 설계 철학 — WHAT과 HOW의 분리

이 프로젝트의 모든 설계 결정이 이 한 표에서 나온다:

| 책임 | 담당 | 예시 |
|---|---|---|
| **WHAT** — 무엇을 검증할지 | LLM | "로그인 후 /dashboard로 가야 하고, 콘솔 에러가 없어야 한다" |
| **HOW** — 어떻게 확인할지 | Runtime (코드) | hydration 대기, 클릭 재시도, 로딩 폴링, 값 정규화·비교, 판정 |

LLM이 잘하는 것(의도 이해, 검증 항목 도출)은 LLM에게, LLM이 못하는 것(타이밍 판단, 정밀 수치 비교, 일관된 판정)은 코드에 맡긴다. **LLM이 비결정성을 일으킬 수 있는 영역에 아예 못 끼어들게 하는 것**이 핵심이다.

이 분리가 만들어내는 세 가지 성질:

- **결정적(deterministic)** — 판정이 기계 비교라 같은 입력이면 항상 같은 출력
- **저비용** — 필요한 값만 콕 집어 읽으니 토큰·시간이 적게 듦
- **flaky 없음** — 대기·재시도가 코드에 박혀 있어 타이밍 실패가 재현되지 않음

---

## 4. 무엇을 할 수 있나 — 기능 전체

### 4-1. 15개 도구 (검증 전용)

v0.4.0부터 **검증 전용(verification-only)** 으로 운영한다. 직접 조작 도구(click/fill/navigate)는 제거했고, 조작은 페어 도구 `agent-browser`에 위임한다 (이유는 [Q&A 8-4](#8-4-왜-조작-기능을-제거했나-v040-결정) 참고).

| 분류 | 도구 | 역할 |
|---|---|---|
| **Lifecycle** (3) | `browser_setup` | 검증 사이클 시작. Chrome 9223 + dev 서버 탭에 연결 |
| | `browser_tab_list` | 열린 탭 목록 |
| | `browser_sentinel_save` | 검증 완료 마커 저장 (자동 검증 무한루프 방지) |
| **Inspection** (4) | `browser_semantic_state` | 페이지 상태를 한 번에: route / modal / primaryCTA / headings / errors / loading 등 |
| | `browser_inspect` | selector별 computed style·text·classList·rect·attr **관찰** (기대값 없이 값만 캡처) |
| | `browser_get_url` | 현재 URL |
| | `browser_is_visible` | 요소 가시성 (DOM + rect + computed style) |
| **Verification** (3) | `browser_verify` | 한 콜에 다중 **assertion** — 13종 check |
| | `browser_check_console` | 콘솔 에러 버퍼 (노이즈 자동 필터) |
| | `browser_check_network` | 네트워크 실패 버퍼 |
| **Tasks** (3) | `browser_load_tasks` / `browser_list_tasks` / `browser_run_task` | 다단계 flow를 JSON으로 정의·1콜 실행 |
| **Escape/Media** (2) | `browser_eval` | 위 도구로 표현 불가능할 때만 raw JS |
| | `browser_screenshot` | JPEG/PNG 캡처 |

**inspect vs verify 구분이 중요하다:** `inspect`는 "값을 모를 때 관찰"(첫 Figma 비교, 토큰 캡처), `verify`는 "값을 알 때 단언"(회귀 가드). 관찰 → 값 확정 → 검증으로 굳히는 흐름.

### 4-2. `browser_verify` — 13종 check

한 콜에 여러 assertion을 배치로 평가한다:

- **state 계열 (8)** — `route`(glob 매칭), `loaded`(자동 대기), `no_errors`, `modal_open` / `modal_closed`, `primary_cta`, `heading_present`, `input_count`
- **DOM 계열 (4, 배치 조회)** — `computed_style`(정밀 CSS 값), `class_present` / `class_absent`, `text`(토스트·라벨·셀 값 contains/equals)
- **figma_spec (1)** — Figma 스펙 JSON 하나로 타이포·스타일·토큰·hover/focus/active 상태를 일괄 검증

### 4-3. Figma → Tailwind 검증 (`figma_spec`)

Figma 디자인을 코드로 옮긴 뒤 "시안대로 됐나"를 check 한 개로 판정한다:

- **타이포** — fontSize / fontWeight / lineHeight / letterSpacing / fontFamily 정확 비교
- **인터랙션 상태** — hover / focus / active를 Playwright 네이티브 입력으로 실제 발동시켜 측정. 측정 직전 transition·animation을 0초로 강제해 "전환 중간색"을 읽는 오류를 차단
- **토큰 사용 검증** — 컴파일된 색은 맞아도 토큰 대신 raw hex(`bg-[#18181b]`)로 박은 케이스를 classList로 적발
- **토큰 선언 검증** — Figma에는 있는데 프로젝트 `:root`에 선언 안 된 CSS 변수 감지
- **비교 정규화** — px ±0.5 허용(DPR 서브픽셀), hex→rgb 자동 변환, fontFamily 표기 정규화 → "값은 맞는데 표기 차이로 FAIL" 하는 false-fail 제거
- **커버리지 가드** — 필수 카테고리(color/border/typography/spacing) 누락 시 경고

### 4-4. Task 시스템 — 반복 검증을 굳히기

"로그인 → 대시보드 진입 → 에러 확인" 같은 다단계 flow를 JSON으로 정의해두면 이후엔 1콜로 재실행:

```json
{
  "performLogin": {
    "args": ["email", "password"],
    "steps": [
      { "op": "goto", "url": "http://localhost:3000/login" },
      { "op": "fill", "selector": "input[name=email]", "value": "{{email}}" },
      { "op": "click", "text": "로그인" },
      { "op": "wait_url", "pattern": "**/dashboard" },
      { "op": "verify", "checks": [{ "type": "no_errors" }] }
    ]
  }
}
```

- **14종 op**: goto · click · fill · navigate · reload · wait_url · wait_text · wait_selector · wait_gone · wait_load · press_key · select_option · verify · screenshot
- `{{argName}}` 템플릿 치환 + 한 step 실패 시 즉시 중단(bail-on-error)
- **두 모드**: 파일에 등록된 named task(`run_task({name})`) / 파일 없이 즉석 inline steps(`run_task({steps})`)
- **lazy creation 패턴**: 처음 요청 시 LLM이 task JSON을 생성 → 사용자가 리뷰·커밋 → 이후 팀 자산으로 축적

이게 "AI가 매번 코드를 새로 짜는" 방식과의 결정적 차이 — **검증이 버려지지 않고 쌓인다.**

### 4-5. Claude Code 플러그인 — 두 줄 설치 + 자동 검증

```
/plugin marketplace add yyoooon/browser-verifier-mcp
/plugin install browser-verifier@yyoooon
```

이 한 번으로 MCP 서버 + skill + agent 3종 + slash command + hook이 전부 자동 배선된다. 구성 요소:

- **skill (`verify`)** — "확인해줘", "검증해줘" 같은 자연어에 자동 발동. Light path(3~5콜, 10초 내) / Full path(서브에이전트) 티어 선택, Wiring-only skip gate 등 검증 전략이 정의돼 있음
- **agents** — verification-planner / browser-executor / systematic-debugger 역할 분담
- **hooks 2종** —
  - `SessionStart`: Chrome 디버그 포트가 안 떠 있으면 한 줄 안내
  - `Stop`(opt-in): Claude가 응답을 끝낼 때마다 git diff를 해시로 비교 → 검증 대상 코드 변경이 있으면 `[auto-verify]` 신호를 주입해 **자동으로 검증 사이클을 시작**. 직전 검증 해시와 같으면 무동작(중복 방지), `browser_sentinel_save`가 완료 마커를 남겨 무한루프 차단
- **slash commands** — `/browser-verifier:launch-chrome`(디버그 Chrome 기동), `/browser-verifier:setup-paired-browser`(agent-browser 페어링 마법사), `enable-auto`/`disable-auto`

즉 켜두면 "코드 수정 → 자동으로 브라우저 검증 → PASS/FAIL 보고"가 사람 개입 없이 돈다.

---

## 5. 어떻게 구현되어 있나 — 아키텍처

### 5-1. 4-layer 구조

```
┌─────────────────────────────────────────────┐
│  Claude Code (LLM)                          │ ← "이 페이지 검증해줘" (자연어)
└─────────────────┬───────────────────────────┘
                  │ MCP (JSON-RPC over stdio)
┌─────────────────▼───────────────────────────┐
│  이 프로젝트 (MCP 서버, src/server.ts)       │ ← 15개 도구 노출
│   ├─ src/tools/*    도구 핸들러 (얇은 어댑터) │
│   └─ src/runtime/*  실제 로직 (Playwright)   │
└─────────────────┬───────────────────────────┘
                  │ Playwright API
┌─────────────────▼───────────────────────────┐
│  playwright-core (npm)                      │ ← Locator, 자동 대기, 재시도
└─────────────────┬───────────────────────────┘
                  │ CDP (WebSocket)
┌─────────────────▼───────────────────────────┐
│  Chrome --remote-debugging-port=9223        │ ← 사용자가 실제로 보는 브라우저
└─────────────────────────────────────────────┘
```

세 프로토콜/라이브러리의 관계를 한 줄로: **이 프로젝트는 MCP 서버이고, 내부에서 Playwright를 쓰며, Playwright는 CDP로 Chrome과 통신한다.**

- **MCP (Model Context Protocol)** — Anthropic이 만든 LLM 도구 호출 표준. JSON-RPC 기반. Claude Code가 이 서버를 자식 프로세스로 띄우고 stdio로 대화한다. LLM은 도구 목록(`tools/list`)을 보고 스스로 어떤 도구를 어떤 순서로 쓸지 결정.
- **Playwright** — Microsoft의 브라우저 자동화 라이브러리. raw CDP 위에 Locator(요소를 "지금의 참조"가 아니라 "조건"으로 표현 — React가 다시 그려도 새 요소를 찾음), 자동 대기, 자동 재시도를 얹어준다.
- **CDP (Chrome DevTools Protocol)** — Chrome이 외부 프로그램의 조작을 허용하는 WebSocket 채널.

### 5-2. 핵심 진입점 — `connectOverCDP`

```ts
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
```

Playwright가 새 브라우저를 띄우는 게 아니라, **사용자가 이미 쓰고 있는 Chrome에 붙는다.** 이 선택이 주는 것:

- 로그인·쿠키·세션 상태를 그대로 사용 (검증 때마다 로그인 안 해도 됨)
- 사용자가 보던 바로 그 페이지를 검증 (환경 불일치 없음)
- 조작 도구(`agent-browser`)와 같은 Chrome을 공유 → 조작과 검증의 상태 일관성

### 5-3. `browser_verify` 한 콜의 내부 — 4단계

검증 요청 하나가 들어오면 (`src/runtime/verify/runVerify.ts`):

1. **① 상태 한 번 추출** — `extractSemanticState`가 **한 번의 `page.evaluate`** 로 route·modal·errors·loading·headings 등 공통 정보를 스냅샷. 여러 check가 이 한 장을 재활용 → 스냅샷 일관성 보장 + 왕복 최소화
2. **② 필요하면 대기** — `loaded` check가 있는데 아직 로딩 중이면 0.15초 간격으로 timeout까지 폴링. React 렌더가 끝나기 전에 검사해서 생기는 flaky를 **코드가** 차단
3. **③ DOM 한 콜로 조회** — `computed_style`·`class_present` 같은 UI check를 전부 모아 브라우저에 **딱 한 번** 질의 (검사 10개 = 전화 1번에 질문 10개)
4. **④ type별 기계 비교** — check마다 종류에 맞는 비교 함수로 `expected == observed` 대조 (`route`는 glob 매칭, `computed_style`은 정규화 후 문자열 비교 등). 하나라도 ❌면 전체 FAIL, 어떤 항목이 어떻게 다른지 구조화해 반환

### 5-4. 결정성을 확보하는 구체적 기법들

| 기법 | 문제 | 해법 |
|---|---|---|
| **Locator + tag-and-retry** | React 리렌더로 클릭 직전 요소가 사라짐(stale) | 요소를 조건으로 참조, 실패 시 다시 찾아 태깅 후 재시도 |
| **hydration 감지** | Next.js SSR 직후엔 버튼이 보여도 클릭이 안 먹음 | 요소에 React fiber 키(`__reactFiber*`)가 붙었는지 확인 후 클릭 |
| **React native setter** | React 컨트롤드 input은 단순 value 대입이 무시됨 | native setter로 값 주입 + 이벤트 발화 |
| **waitPageStable** | 애니메이션·네트워크 진행 중 측정하면 값이 흔들림 | domcontentloaded + networkidle + `getAnimations()` 빈 상태를 함께 대기 |
| **transition 0초 강제** | hover 색 측정 시 전환 중간색이 읽힘 | 측정 직전 transition/animation을 0초로 오버라이드 |
| **값 정규화** | `#fff` vs `rgb(255,255,255)`, DPR 서브픽셀 | hex→rgb 변환, px ±0.5 허용, fontFamily 표기 통일 |
| **노이즈 필터** | HMR·브릿지 로그가 콘솔 검사를 오염 | console/network 버퍼에서 알려진 노이즈 자동 제거 |

### 5-5. 코드 구조

```
src/
├── server.ts            # MCP 진입점 — 15개 도구 등록 + dispatch + instructions 주입
├── instructions.ts      # BROWSER_RULES — 조작/검증 역할 분리 규칙 (세션 시작 시 자동 주입)
├── tools/               # 도구 핸들러 — MCP 형식에 맞추는 얇은 어댑터
│   └── checks.ts        #   console/network + NOISE_PATTERNS 필터 (HMR / Fast Refresh 등)
├── runtime/             # 실제 로직 — Playwright primitive
│   ├── client.ts        #   connectOverCDP 싱글톤
│   ├── interaction/     #   safeClick / safeFill (retry + React native setter)
│   ├── navigation/      #   waitPageStable (networkidle + 애니메이션 종료 대기)
│   ├── semantic/        #   extractSemanticState — evaluate 1회로 페이지 스냅샷
│   ├── inspect/         #   runInspect — 배치 관찰
│   ├── verify/          #   13종 check 타입 + runVerify
│   │   └── figma/       #     compare(px ±0.5 허용) · normalize(hex→rgb) ·
│   │                    #     state(hover/focus/active) · transitionGuard(전환 0초) ·
│   │                    #     tokens(스와치 검증) · coverage(카테고리 가드)
│   └── tasks/           #   loader / registry / runner (14종 op, {{arg}} 치환)
├── cdp/                 # actions(clickByText·hydration 감지), wait, eval, 버퍼
└── lib/                 # result 헬퍼, glob 매칭
```

tools(어댑터)와 runtime(로직)을 분리한 이유: task runner가 runtime 함수를 직접 재사용할 수 있고, MCP가 아닌 다른 인터페이스로도 노출 가능하다.

의존성은 단 둘: `@modelcontextprotocol/sdk` + `playwright-core`. TypeScript, stdio transport, MIT 라이선스. figma 비교·task 로더에는 node 내장 test runner 기반 유닛 테스트가 있다(`npm test`).

### 5-6. MCP instructions — 규칙을 서버가 직접 주입 (v0.7.0)

"조작은 agent-browser, 검증은 이 MCP" 같은 역할 분리 규칙을 MCP 서버의 `instructions` 필드(`src/instructions.ts`의 `BROWSER_RULES`)로 세션 시작 시 클라이언트에 자동 주입한다. 소비 프로젝트가 CLAUDE.md에 규칙을 복사해둘 필요가 없다 — **플러그인 설치만으로 사용 규약까지 배포**되는 구조.

---

## 6. 다른 도구와 뭐가 다른가 — 비교

### 6-1. 한 문장 요약

> 다른 도구들은 "AI가 화면을 읽고 판단"하거나 "사람이 미리 테스트 코드를 짜두는" 방식이다. browser-verifier는 그 사이 — **AI가 검증 항목을 지정하면, 고정된 코드가 판정**하는 유일한 지점을 차지한다.

### 6-2. AI 브라우저 도구들과 비교 (같은 카테고리)

| 질문 | Playwright MCP | agent-browser | AI가 매번 직접 코딩 | **browser-verifier** |
|---|---|---|---|---|
| 판정 주체 | AI가 트리 읽고 판단 | AI가 트리·스크린샷 보고 판단 | AI가 짠 코드 + AI 해석 | **고정된 코드가 기계 비교** |
| 같은 검증 2회 → 같은 결과? | 흔들릴 수 있음 | 흔들릴 수 있음 | 매번 코드가 달라 제일 불안정 | **항상 같음** |
| 1회 비용 | 트리 통째 → 무거움 | 트리·스크린샷 → 무거움 | 코드 생성 → 무거움 | **필요한 값만 → 가벼움** |
| CSS px·색 정밀 판정 | △ (트리에 값 없음) | △ (동일) | ✅ (직접 짜야) | ✅ **코드가 정밀 비교** |
| 대기(타이밍) 처리 | AI가 알아서 (놓치면 flaky) | AI가 판단해 호출 | 매번 직접 넣어야 함 | **코드가 항상 자동** |
| 검증 재사용 | ✗ | ✗ | ✗ (코드 버려짐) | ✅ **task로 저장·반복** |
| 브라우저 폭 | Chromium·WebKit·Firefox | Chromium·Safari 등 | Playwright와 동일 | Chromium만 (CDP attach) |
| 최적 용도 | 사이트 탐색 | 탐색·멀티브라우저·Vision | 1회성 특이 조작 | **코드 수정 후 결정적 회귀 검증** |

핵심 구분: Playwright MCP와 agent-browser는 **"AI 판정" 계열**(유연하지만 흔들림), browser-verifier는 **"코드 판정" 계열**(좁지만 결정적). 경쟁이 아니라 역할이 다르다 — 실제로 이 프로젝트는 agent-browser와 **페어로 쓰도록 설계**됐다(조작은 agent-browser, 검증은 본 MCP, 같은 Chrome 9223 공유).

### 6-3. 전통 E2E 테스트 (Playwright Test / Cypress)와 비교

"그냥 E2E 테스트 짜면 되지 않나?"가 가장 많이 나올 질문. 대상 국면이 다르다:

| | E2E 테스트 (Playwright Test / Cypress) | browser-verifier |
|---|---|---|
| **언제** | 기능 완성 후, CI에서 | **개발 중**, 코드 수정 직후 즉시 |
| **누가 검증 항목을 정하나** | 사람이 미리 코드로 작성 | AI가 diff를 보고 그 자리에서 도출 |
| **작성 비용** | 테스트 코드 작성·유지보수 필요 | 자연어 한 마디 ("확인해줘") |
| **브라우저** | 격리된 새 인스턴스 (로그인 셋업 필요) | **지금 내가 보던 Chrome** (세션 그대로) |
| **커버 범위** | 미리 짜둔 시나리오만 | 방금 바꾼 부분에 맞춰 동적으로 |
| **결과 축적** | 테스트 스위트로 축적 | 반복되는 것만 task JSON으로 축적 |

E2E 테스트는 "회귀 안전망"(사후·정적), browser-verifier는 "개발 루프의 즉석 확인"(즉시·동적)이다. 대체가 아니라 **테스트를 짜기 전 단계의 공백**을 메운다. 자주 반복되는 검증이 task로 굳으면 그게 사실상 경량 E2E가 된다.

### 6-4. 시각 회귀 도구 (Percy / Chromatic)와 비교

Percy·Chromatic은 스크린샷 픽셀 diff로 1~2px 시각 회귀를 잡는다. browser-verifier는 의도적으로 그 영역에 들어가지 않는다 — 대신 **의미 있는 값**(computed style, 클래스, 토큰)을 비교한다. "픽셀이 달라졌나"가 아니라 "스펙대로 구현됐나"를 묻는 도구.

---

## 7. 한계 — 못 하는 것

한계를 솔직하게 알려주는 것도 소개의 일부다:

- **픽셀 퍼펙트 비교 불가** — 1~2px 시각 회귀는 Percy/Chromatic 영역 (의도적 스코프 아웃)
- **Chromium 전용** — `connectOverCDP` 방식이라 Safari/Firefox 크로스브라우저 검증 불가
- **일부 휴리스틱이 React 기반** — hydration 감지, controlled input 처리 등. 비-React에서도 동작은 하지만 최적화는 React/Next.js 대상
- **디자인의 주관적 "느낌"은 판정 불가** — 기계 비교의 본질적 한계
- **다크모드 자동 매칭 없음** — 모드별 spec을 따로 작성하면 가능
- **사전 셋업 필요** — Chrome을 디버깅 포트로 띄워야 함 (slash command로 한 줄이지만, 제로 셋업은 아님)

---

## 8. 예상 질문 & 답변

### 8-1. "결정적(deterministic)이라는 게 정확히 무슨 뜻이죠?"

같은 입력에 항상 같은 출력. 이 도구에서는 "같은 화면 상태에 같은 checks를 주면 언제 돌려도 같은 PASS/FAIL"을 뜻한다. LLM 판정은 확률적 생성이라 이 성질이 없다. 이 프로젝트는 판정 로직을 전부 코드로 내려서(glob 매칭, 문자열 비교, classList 검사) 이 성질을 확보했다. 참고로 결정성 ≠ 정확성 — LLM도 정확할 수 있지만 결정적이지 않을 수 있고, 검증에는 둘 다 필요하다.

### 8-2. "왜 새 브라우저를 띄우지 않고 기존 Chrome에 붙나요?"

세 가지 이유. ① 개발자가 보던 페이지·로그인·쿠키 상태를 그대로 검증 — 검증 환경과 실제 환경의 불일치가 없다. ② 검증 사이클마다 로그인 셋업을 반복하지 않아 빠르다. ③ 조작 도구(agent-browser)와 같은 인스턴스를 공유해 조작→검증 간 상태 일관성이 보장된다. 트레이드오프는 Chromium 전용이 된다는 것과 디버깅 포트 기동이라는 사전 셋업.

### 8-3. "flaky를 어떻게 막나요?"

flaky의 주범은 타이밍(렌더 전 검사)과 stale 참조(리렌더로 요소 소멸)다. 각각을 코드 레벨에서 잡는다: `loaded` 폴링(0.15초 간격)·waitPageStable(networkidle + 애니메이션 종료)로 타이밍을, Playwright Locator + tag-and-retry로 stale을, hydration 감지(`__reactFiber*` 키 확인)로 "보이지만 클릭 안 되는" Next.js SSR 특유의 문제를 막는다. 핵심은 이걸 **AI가 기억해서 넣는 게 아니라 런타임에 항상 박혀 있다**는 것 — 빼먹을 수가 없다.

### 8-4. "왜 조작 기능을 제거했나요?" (v0.4.0 결정)

관심사 분리. 조작(탐색·클릭·입력)은 유연함이 중요해서 AI 판단 계열 도구(agent-browser)가 잘하고, 검증은 결정성이 중요해서 코드 판정이 잘한다. 하나의 도구가 둘 다 하려면 어느 쪽 설계 원칙도 지키기 어렵다. 그래서 검증 전용으로 좁히고, 조작은 같은 Chrome을 CDP로 공유하는 agent-browser에 위임했다. 단, 검증 시나리오 안에서 필요한 다단계 조작(로그인 후 검증 등)은 `browser_run_task`의 step으로 표현 가능 — "검증 flow의 일부인 조작"과 "자유 조작"을 구분한 것.

### 8-5. "토큰 절약이 왜 그렇게 중요한가요?"

비용 문제만이 아니다. ① LLM은 context window가 유한해서 화면 트리를 매번 통째로 넣으면 대화의 다른 정보가 밀려난다. ② 컨텍스트가 커질수록 응답이 느려지고 판단 품질도 떨어진다. ③ 자동 검증(Stop hook)처럼 **코드 수정마다** 도는 사이클이라면 1회 비용이 누적된다. semantic_state가 화면을 수백 토큰의 구조화 JSON으로 압축하고, verify가 필요한 값만 반환하는 이유다.

### 8-6. "MCP가 뭐고, 왜 MCP 서버로 만들었나요?"

MCP(Model Context Protocol)는 Anthropic이 2024년 발표한 LLM 도구 호출 표준 — JSON-RPC 기반으로, 도구 제공자가 서버 하나만 만들면 MCP를 지원하는 모든 클라이언트(Claude Code, Claude Desktop 등)에서 쓸 수 있다. 이 프로젝트를 MCP 서버로 만든 덕에 LLM이 도구 이름·설명·스키마만 보고 스스로 어떤 검증 도구를 어떤 순서로 쓸지 결정한다. 특정 에이전트 구현에 종속되지 않는다.

### 8-7. "그냥 Playwright 테스트를 짜는 것과 뭐가 다른가요?"

국면이 다르다. Playwright 테스트는 사람이 미리 시나리오를 코드로 짜서 CI에서 돌리는 **사후 안전망**이고, 이 도구는 코드를 고친 **그 순간** AI가 diff에 맞는 검증 항목을 즉석에서 도출해 돌리는 **개발 루프 도구**다. 테스트 코드를 안 짜도 되고, 방금 바꾼 부분에 맞춰 검증이 동적으로 구성된다. 반복되는 검증은 task JSON으로 굳혀서 사실상 경량 E2E로 축적할 수도 있다. 대체가 아니라 보완 관계.

### 8-8. "AI가 checks를 잘못 지정하면요? 결국 AI 의존 아닌가요?"

맞다, WHAT의 품질은 여전히 AI 책임이다. 다만 실패 모드가 다르다. AI 판정 방식은 "검증했다고 하는데 실제로 안 봤거나 잘못 봤을" 수 있고 그걸 알 방법이 없다. 이 도구는 무엇을 검사했고 expected/observed가 무엇이었는지가 **구조화된 기록으로 남는다** — 검증 항목이 부족하면 눈에 보이고, 사람이 checks를 리뷰·보강할 수 있다. "판단을 없앤" 게 아니라 "판단을 검증 가능하게 만든" 것. 또한 skill이 diff 카테고리→검증 항목 매핑 규칙을 제공해 AI의 항목 선정 자체도 패턴화돼 있다.

### 8-9. "자동 검증은 어떻게 무한루프에 안 빠지나요?"

Stop hook은 Claude가 응답을 끝낼 때마다 불리므로, 검증 응답이 또 검증을 트리거하면 무한루프다. 두 겹으로 막는다: ① git diff(+ untracked)의 sha256 해시를 계산해 직전 검증 마커(`.claude/.last-verified-hash`)와 같으면 무동작 — 코드가 안 바뀌었으면 재검증 안 함. ② 검증 사이클의 마지막 도구 `browser_sentinel_save`가 그 마커를 갱신 — PASS든 에스컬레이션이든 저장해서 같은 diff로는 다시 안 돈다. 코드를 다시 고치면 해시가 바뀌어 자연히 재검증된다.

### 8-10. "figma_spec에서 hover 색 검증이 왜 어렵고, 어떻게 풀었나요?"

두 가지 함정이 있다. ① hover는 CSS 가상 상태라 JS로 클래스만 넣어서는 실제와 다를 수 있음 → Playwright 네이티브 마우스 입력으로 **진짜 hover를 발동**시켜 measured. ② transition이 걸려 있으면 측정 시점에 전환 **중간색**이 읽힘 → 측정 직전 해당 요소의 transition/animation을 0초로 강제해 최종값만 읽는다. 추가로 Tailwind v4가 OKLCH 색공간을 쓰는 것, hex vs rgb 표기 차이 같은 정규화 문제도 비교 레이어에서 흡수한다.

### 8-11. "raw CDP로 직접 만들지 왜 Playwright를 얹었나요?"

실제로 초기 버전은 `chrome-remote-interface`로 raw CDP를 썼고, 리팩터(phase 1~2)에서 Playwright로 옮겼다. raw CDP는 요소 참조가 "그 순간의 objectId"라 React 리렌더 한 번이면 stale이 되고, 대기·재시도를 전부 손으로 짜야 한다. Playwright의 Locator(조건 기반 참조, 사용 시점 재탐색)와 actionability 자동 대기가 결정성 확보 비용을 크게 줄였다. 대신 무거운 `playwright` 대신 브라우저 바이너리 없는 `playwright-core`만 의존해 설치를 가볍게 유지했다.

### 8-12. "실제로 겪은 까다로운 버그가 있다면?" (실전 트러블슈팅)

세 가지가 대표적 (모두 실제 커밋으로 남아 있음):

- **macOS에서 CDP 연결이 간헐적으로 실패** — Node 17+가 `localhost`를 IPv6(`::1`)로 먼저 resolve하는데, Chrome CDP는 IPv4(`127.0.0.1`)로만 LISTEN한다. 서버 최상단에서 `dns.setDefaultResultOrder("ipv4first")`로 해결 (`src/server.ts:5`).
- **tsx dev 모드에서만 `page.evaluate`가 깨짐** — tsx(esbuild)가 함수를 직렬화할 때 `__name` 헬퍼 호출을 끼워 넣는데, 그 함수가 브라우저 컨텍스트에는 존재하지 않아 런타임 에러. 브라우저에 주입하는 스크립트에 `__name` polyfill을 선행시켜 해결. "코드를 문자열로 다른 런타임에 보내는" 구조 특유의 함정.
- **값은 맞는데 FAIL 나는 false-fail** — Tailwind v4는 색을 OKLCH로 정의하고, 브라우저는 computed 값을 `rgb()`로 돌려주며, Figma는 hex로 준다. 표기가 3개라 순진하게 문자열 비교하면 다 틀린다. 비교 전 정규화 레이어(hex→rgb 변환, px ±0.5 허용, fontFamily 표기 통일)를 두어 해결 (`src/runtime/verify/figma/normalize.ts`, `compare.ts`).

### 8-13. "이 도구의 가장 큰 리스크 혹은 개선하고 싶은 점은?"

① semantic state 추출이 modal·CTA 같은 휴리스틱에 의존 — 특이한 마크업에서는 빗나갈 수 있어, 프로젝트별 커스텀 추출 규칙이 다음 과제. ② React 특화 휴리스틱의 일반화. ③ task JSON이 쌓였을 때의 관리(네이밍·중복·버전) 스토리. ④ 검증 커버리지를 정량화해 "무엇이 검증 안 됐는지"를 보여주는 리포트.

---

## 부록 — 더 깊이 볼 문서

| 문서 | 내용 |
|---|---|
| [`docs/쉽게-이해하기.md`](./docs/쉽게-이해하기.md) | 가장 쉬운 비유(채점) 중심 입문 |
| [`docs/이-MCP-소개.md`](./docs/이-MCP-소개.md) | 왜/누구/무엇 전체 개요 |
| [`docs/browser_verify-내부동작.md`](./docs/browser_verify-내부동작.md) | verify 4단계를 코드와 함께 |
| [`docs/concepts.md`](./docs/concepts.md) | LLM·CDP·MCP 기초 개념 + 용어 사전 |
| [`docs/refactor-phase-1~9.md`](./docs/refactor-phase-1.md) | raw CDP → Playwright → task → plugin 진화 기록 |
| [`skills/verify/SKILL.md`](./skills/verify/SKILL.md) | 검증 전략 (5 rules, Tier, Skip gate) |

---
---

# 실무 가이드 — 설치 · 셋업 · 레퍼런스

## 사전 요구사항

- Node.js 18+
- Chrome (or Chromium) 9223 디버깅 포트로 실행
- MCP 클라이언트 (Claude Code 등)

---

## 설치 — Claude Code Plugin (권장)

Claude Code 안에서 두 줄:

```
/plugin marketplace add yyoooon/browser-verifier-mcp
/plugin install browser-verifier@yyoooon
```

이 한 번으로 **MCP 서버 + skill + agent + slash command + Stop hook 매핑**이 모두 자동 wiring. `~/.claude.json` 직접 편집 불필요. 끝.

업데이트는 `/plugin marketplace update yyoooon` 후 `/plugin install` 재실행. 제거는 `/plugin uninstall browser-verifier@yyoooon`.

### 자동 검증 켜기 (선택)

설치 직후엔 **자동 발동 OFF** 상태. 코드 수정마다 자동으로 검증 사이클 돌리고 싶으면:

```
/browser-verifier:enable-auto
```

끄려면 `/browser-verifier:disable-auto`.

> 셸에서 직접 `touch ~/.browser-verifier-auto` (또는 `rm`)으로도 동일 — slash command가 결국 이 sentinel 파일을 만들고 지움.

---

## 설치 — Manual (plugin 사용 안 할 때)

기존 방식으로 직접 wiring하고 싶다면:

```bash
git clone https://github.com/yyoooon/browser-verifier-mcp.git
cd browser-verifier-mcp
npm install
npm run build
```

`~/.claude.json`의 `mcpServers`에 추가:

```json
{
  "mcpServers": {
    "browser-verifier": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/browser-verifier-mcp/dist/server.js"]
    }
  }
}
```

선택: 시작 시 task 자동 로드하려면 `env.VERIFIER_TASKS_PATH`에 절대경로 추가.

Skill / Hook 활성화는 별도 — [`hooks/README.md`](./hooks/README.md) + skill 디렉토리를 `~/.claude/skills/`에 심볼릭 링크.

Claude Code 재시작.

> 이 repo에 직접 코드 변경 / commit하려면 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 참고 (pre-commit hook 셋업 + dist/ 동기화 자동화).

---

## Chrome 9223 셋업

### 슬래시 명령 (권장)

```
/browser-verifier:launch-chrome           # 9223 디폴트
/browser-verifier:launch-chrome 9224      # 다른 포트
```

Idempotent — 이미 떠있으면 no-op. user-data-dir은 `~/.cache/browser-verifier/chrome-<port>`.

세션 시작 시 Chrome이 안 떠있으면 SessionStart hook이 자동으로 한 줄 안내. 끄려면 `touch ~/.browser-verifier-no-session-check`.

### 직접 alias (수동 셋업)

```bash
alias chrome-debug='/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-9223 &'
```

검증 흐름:
1. dev 서버 실행 (예: `yarn dev` → `localhost:3000`)
2. `chrome-debug` 또는 `/browser-verifier:launch-chrome`로 Chrome 띄움
3. 그 Chrome에서 `localhost:3000` 직접 열기

## 페어 도구 — `agent-browser`

본 MCP는 **검증 전용** (v0.4.0부터 click/fill/navigate 제거). 조작은 [`agent-browser`](https://github.com/vercel-labs/agent-browser)와 페어로 쓰는 게 권장 워크플로:

| 역할 | 도구 |
|---|---|
| 조작 (navigate / click / fill / scroll / hover ...) | `agent-browser --cdp 9223` |
| 검증 (verify / check_console / check_network / inspect ...) | 본 MCP (`browser_setup` → ...) |

두 도구가 같은 Chrome 9223을 공유 → 로그인/쿠키 상태 일관.

**첫 셋업은 슬래시 명령으로 한 번에**:

```
/browser-verifier:setup-paired-browser
```

→ 3가지 (사용 모드 · agent-browser 설치 위치 · CDP 포트)를 물어보고 설치/launch/검증까지 자동 진행.

> 조작/검증 역할 분리 규칙은 MCP 서버의 `instructions`로 세션 시작 시 자동 주입됨 (별도 CLAUDE.md 작성 불필요).

---

## Quick example

Claude Code에서 자연어로 시킴:

```
너:  "/partners 페이지가 잘 떴는지 확인해줘"

LLM (실행):
  browser_setup({ port: 3000 })
  browser_verify({
    checks: [
      { type: "route", expected: "**/partners" },
      { type: "primary_cta", expectedText: "제휴업체 등록" },
      { type: "no_errors" },
    ]
  })
  browser_check_console({ level: "error" })
  browser_sentinel_save()

LLM 보고:
  "✅ PASS — 검증 통과 (1.2s) — light path
     체크: route /partners / CTA "제휴업체 등록" enabled / console 에러 0"
```

---

## 15개 도구 (verification-only)

### Lifecycle
- `browser_setup({ port?, cdpPort? })` — 사이클 시작. Chrome 9223 + localhost:port 탭에 연결.
- `browser_tab_list()` — Chrome 9223의 모든 page target.
- `browser_sentinel_save({ projectRoot? })` — `.claude/.last-verified-hash` 작성, Stop hook 루프 차단.

### Inspection
- `browser_semantic_state()` — 페이지 상태 한 번에: route / title / loading / modal / primaryCTA / headings / errors / inputCount / focusedElement.
- `browser_inspect({ targets })` — selector별 computed style / text / classList / rect / attr **관찰**을 1콜에 일괄. expected 모를 때(첫 Figma 비교, 토큰 캡처) 사용. assertion은 `browser_verify`.
- `browser_get_url()` — 현재 URL.
- `browser_is_visible({ selector })` — DOM + clientRect + computed style 가시성.

### Verification
- `browser_verify({ checks })` — 한 콜에 다중 **assertion**. 13 check 종류 (8 state + 4 DOM + figma_spec).
  - state: `primary_cta`, `no_errors`, `loaded`, `route`, `modal_open`, `modal_closed`, `heading_present`, `input_count`
  - DOM (batched): `computed_style`, `class_present`, `class_absent`, `text` (임의 요소의 텍스트 contains/equals — 토스트·라벨·셀 값)
  - figma: `figma_spec` — spec 파일/객체 1개로 타이포·스타일·토큰·hover/focus/active 상태를 한 번에 검증 (아래 [Figma 검증](#figma--tailwind-검증) 참고).
  - **관찰만** 필요하면 `browser_inspect` (위, expected 불필요).
- `browser_check_console({ level?, clear? })` — 콘솔 버퍼 (노이즈 자동 필터).
- `browser_check_network({ status?, urlContains? })` — 네트워크 버퍼 (default: errors).

### Interaction
직접 노출되는 조작 툴은 제거됨. 검증 전용 MCP로 운영. 조작은 외부 도구(`agent-browser` 등)에 위임하고, 내부적으로 필요한 멀티스텝 조작은 `browser_run_task`(`cdp/actions` 사용)로 표현.

### Tasks (multi-step flow)
- `browser_load_tasks({ path })` — JSON tasks 파일 로드.
- `browser_list_tasks()` — 로드된 task 메타데이터.
- `browser_run_task({ name?, steps?, args? })` — 두 모드: registered task by `name`, 또는 inline `steps`.

### Escape / Media
- `browser_eval({ script, timeoutMs? })` — Raw JS. semantic_state / verify / interaction 도구로 표현 불가능할 때만.
- `browser_screenshot({ name?, fullPage?, format?, quality? })` — JPEG/PNG 캡처.

---

## 워크플로 패턴

### 1. 1회성 페이지 상태 확인

```
browser_semantic_state()
→ { route, modal: null, primaryCTA: { text: "저장", ... }, ... }
```

### 2. 1회성 다중 assertion

```
browser_verify({
  checks: [
    { type: "route", expected: "**/dashboard" },
    { type: "loaded", timeoutMs: 3000 },
    { type: "no_errors" },
    { type: "heading_present", text: "건강 지표" },
  ]
})
```

### 3. 1회성 multi-step (click → wait → verify mixed)

파일 생성 없이 inline 실행:

```
browser_run_task({
  steps: [
    { op: "click", text: "상세 보기" },
    { op: "wait_selector", selector: "[role=dialog]", timeoutMs: 2000 },
    { op: "verify", checks: [
        { type: "modal_open" },
        { type: "input_count", min: 1 },
    ]}
  ]
})
```

### 4. 반복 flow를 task로 굳히기

`.browser-verifier/tasks.json`:

```json
{
  "performLogin": {
    "args": ["email", "password"],
    "steps": [
      { "op": "goto", "url": "http://localhost:3000/login" },
      { "op": "fill", "selector": "input[name=email]", "value": "{{email}}" },
      { "op": "fill", "selector": "input[name=password]", "value": "{{password}}" },
      { "op": "click", "text": "로그인" },
      { "op": "wait_url", "pattern": "**/dashboard" },
      { "op": "verify", "checks": [{ "type": "no_errors" }] }
    ]
  }
}
```

LLM이 처음 요청 시 자동 생성 → 사용자가 review + commit (lazy creation 패턴). 이후엔:

```
browser_run_task({ name: "performLogin", args: { email: "...", password: "..." } })
```

14 ops: `goto` · `click` · `fill` · `navigate` · `reload` · `wait_url` · `wait_text` · `wait_selector` · `wait_gone`(요소 사라짐 대기 — 모달 닫힘/토스트 소멸) · `wait_load` · `press_key`(Escape/Enter 등) · `select_option`(네이티브 select) · `verify` · `screenshot`. `{{argName}}` 템플릿 치환 + bail-on-error.

전체 예시: [`templates/tasks.example.json`](./templates/tasks.example.json).

---

## Figma → Tailwind 검증

### 권장 — `figma_spec` check 한 줄 (v0.6.0)

Figma 토큰을 표준 JSON(`.figma-specs/<name>.figma-spec.json`)으로 추출해두면, **check 한 개**로 타이포·스타일·토큰·인터랙션 상태를 한 번에 검증:

```
browser_verify({
  checks: [
    { type: "loaded" },
    { type: "no_errors" },
    { type: "figma_spec", spec: ".figma-specs/notice-header.figma-spec.json" }
  ]
})
```

`figma_spec` 한 개가 자동으로 해주는 것:

- **타이포** — `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` / `fontFamily` 정확 비교
- **임의 스타일 prop** — 색·보더·라운드·패딩·간격 등 (hex → rgb 자동 정규화)
- **인터랙션 상태** — target별 `rest` / `hover` / `focus` / `active`를 Playwright 네이티브 입력으로 발동해 측정 (측정 직전 transition/animation을 0초로 강제 → 중간색 방지)
- **토큰 사용 검증** — `target.tokens[]`: 컴파일된 색이 맞아도 raw hex(`bg-[#18181b]`)로 박은 케이스를 classList로 잡아냄 (`[token-usage]`)
- **토큰 연결 검증 (옵트인)** — `tokens[]` 항목을 `{ "class": "bg-primary", "prop": "backgroundColor" }` 객체로 넣으면 레퍼런스 스와치로 "토큰이 실제 화면을 칠하는지"까지 검증 — rgb를 spec에 굽지 않아 팔레트가 바뀌어도 spec 수정 불필요 (`[token-swatch]`)
- **비교 정규화** — px는 ±0.5px 허용(DPR/줌 서브픽셀), 색은 공백 무시 + hex→rgb 자동 변환, fontFamily는 따옴표/대소문자/`BlinkMacSystemFont`↔`system-ui` 정규화 — 값이 맞는데 표기 차이로 FAIL 나는 false-fail 제거
- **토큰 선언 검증** — `spec.cssVariables[]`: `:root`에 해당 CSS 변수가 없으면 fail — Figma엔 있는데 프로젝트에 없는 토큰 감지 (`[token-declared]`)
- **커버리지 가드** — 필수 카테고리(color / border / typography / spacing)가 spec에서 누락되면 `[spec-coverage]` 경고 (`spec.strict=true`면 fail)

spec 작성 표준·selector/state 규칙·OKLCH 함정·토큰 미선언 시 행동 규약 → [`skills/verify/references/figma-spec-workflow.md`](./skills/verify/references/figma-spec-workflow.md).

### 저수준 — 개별 check 직접 나열

spec 없이 1~2개만 빠르게 확인할 땐 개별 check로도 가능:

```
browser_verify({
  checks: [
    { type: "class_present", selector: "[data-slot=card]", className: "bg-[#d6eafa]" },
    { type: "computed_style", selector: "[data-slot=card]", prop: "backgroundColor", expected: "rgb(214, 234, 250)" },
    { type: "computed_style", selector: "[data-slot=card]", prop: "padding", expected: "16px" },
    { type: "computed_style", selector: "[data-slot=card]", prop: "fontWeight", expected: "500" }
  ]
})
```

브라우저 정규화 / Tailwind v4 OKLCH 함정 / 처음 토큰 캡처 패턴 → [`skills/verify/references/figma-tailwind-check.md`](./skills/verify/references/figma-tailwind-check.md).

---

## Claude Code skill / agents

`skills/verify/SKILL.md` — 자동 발동 가능한 skill 정의 (Stop hook + `[auto-verify]` 시그널).

`agents/` — verification-planner / browser-executor / systematic-debugger 역할 정의.

`hooks/` — 자동 발동용 Stop hook 1종 + plugin이 자동 wiring할 `hooks.json` manifest. 설치·배선은 [`hooks/README.md`](./hooks/README.md).

상세 가이드:
- [`skills/verify/SKILL.md`](./skills/verify/SKILL.md) — 5 rules, Standard Cycle, Tier/Category 선택
- [`skills/verify/references/tier-selection.md`](./skills/verify/references/tier-selection.md) — Light vs Full path
- [`skills/verify/references/category-selection.md`](./skills/verify/references/category-selection.md) — diff → 검증 카테고리
- [`skills/verify/references/full-path-brief.md`](./skills/verify/references/full-path-brief.md) — Subagent dispatch
- [`skills/verify/references/figma-spec-workflow.md`](./skills/verify/references/figma-spec-workflow.md) — `figma_spec` 워크플로 (spec 작성·state·토큰·커버리지)
- [`skills/verify/references/figma-tailwind-check.md`](./skills/verify/references/figma-tailwind-check.md) — Figma → Tailwind 저수준 검증
- [`skills/verify/references/token-check.md`](./skills/verify/references/token-check.md) — 토큰 적용 검사

---

## 잘 잡힘 / 못 잡힘

✅ 결정적으로 잡힘:
- 잘못된 Tailwind 클래스 / spacing / font-weight
- 토큰 적용 여부 (classList + computed) / 토큰 미선언 (`figma_spec`)
- hover / focus / active 상태의 컴파일된 값 (`figma_spec`, transition 0초 강제)
- 라우트 변경 / 모달 열림-닫힘
- console / network 에러
- React 컨트롤드 input 채우기 (native setter fallback)

❌ 못 잡음 (별도 도구 필요):
- 1-2px pixel-perfect 회귀 → Percy / Chromatic
- 다크모드 자동 매칭 (모드별 spec 따로 작성하면 가능)
- 디자인의 주관적 "느낌"

---

## 아키텍처

리팩터 phase별 기록 (chrome-remote-interface raw CDP → Playwright + task runtime):

- [`docs/refactor-phase-1.md`](./docs/refactor-phase-1.md) — Playwright Runtime 기반
- [`docs/refactor-phase-2.md`](./docs/refactor-phase-2.md) — Stabilization (Locator retry, route stabilize)
- [`docs/refactor-phase-3.md`](./docs/refactor-phase-3.md) — Semantic state
- [`docs/refactor-phase-4.md`](./docs/refactor-phase-4.md) — Generic verification framework
- [`docs/refactor-phase-5.md`](./docs/refactor-phase-5.md) — Declarative JSON tasks
- [`docs/refactor-phase-6.md`](./docs/refactor-phase-6.md) — Surface narrowing (14 도구)
- [`docs/refactor-phase-7.md`](./docs/refactor-phase-7.md) — Style verification checks
- [`docs/refactor-phase-8.md`](./docs/refactor-phase-8.md) — Interaction primitives (task ops)
- [`docs/refactor-phase-9.md`](./docs/refactor-phase-9.md) — Plugin distribution (two-line install)

---

## License

MIT — [`LICENSE`](./LICENSE) 참고.

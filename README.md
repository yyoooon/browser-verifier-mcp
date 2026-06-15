# browser-verifier-mcp

Claude Code 같은 MCP 클라이언트에서 동작하는 **결정적 브라우저 검증 서버**. Playwright `connectOverCDP`로 이미 떠 있는 Chrome 9223에 붙어서, 라이브 페이지 상태를 구조화된 JSON으로 확인하고, 다단계 인터랙션을 1콜로 실행한다.

LLM에게 "WHAT을 검증할지"만 시키고, "HOW"(hydration / retry / 안정화)는 runtime이 처리한다.

> **AI / 브라우저 자동화 / MCP를 처음 다룬다면** → 난이도순으로 ① 가장 쉬운 [`docs/쉽게-이해하기.md`](./docs/쉽게-이해하기.md)(채점 비유) → ② 왜/누구/무엇 정리한 [`docs/이-MCP-소개.md`](./docs/이-MCP-소개.md) → ③ 검증 내부 4단계 [`docs/browser_verify-내부동작.md`](./docs/browser_verify-내부동작.md) → ④ 설계 개념 [`docs/concepts.md`](./docs/concepts.md).

---

## 한 줄 정의

> **내가 코드 고친 후 브라우저에서 직접 확인하는 일을 Claude가 대신 하게 해주는 플러그인.**

### 쉽게 말하면 — "자동 채점기"

검증이란 "이거 잘 됐나?"에 ✅/❌를 매기는 일. 그 **채점을 누가 하느냐**가 이 도구의 정체성이다.

- **Playwright MCP = 눈으로 채점하는 조교** — 화면(접근성 트리)을 **통째로** AI한테 주면, AI가 읽고 "맞는 것 같다" 판단. → 유연하지만 결과가 흔들리고, 토큰을 많이 씀.
- **browser-verifier = 자동 채점기(OMR)** — "무엇을 볼지"(selector·기대값)만 정하면, 코드가 **정해진 칸만** 읽어 기계적으로 대조. → 빠르고, 매번 같은 결과.

즉 **AI는 "WHAT"(무엇을 검증할지)만 정하고, "HOW"(읽기·대기·비교·판정)는 코드가** 한다. 그래서 결과가 흔들리지 않는다(deterministic). 이 차이가 둘로 갈라진다:

|              | browser-verifier (자동 채점기) | Playwright MCP (눈 채점 조교) |
| ------------ | ------------------------------ | ----------------------------- |
| **누가 판정** | 코드가 기계적으로 → 항상 같음   | AI가 눈으로 → 흔들릴 수 있음   |
| **얼마나 읽나** | 필요한 값만 콕 → 빠름·저토큰  | 트리 통째로 → 느림·고토큰      |

> 더 쉬운 비유 풀이는 [`docs/쉽게-이해하기.md`](./docs/쉽게-이해하기.md), 왜/누구/무엇 전체 개요는 [`docs/이-MCP-소개.md`](./docs/이-MCP-소개.md).

---

## 어떤 문제를 푸는가

웹 개발하다 보면 매번 반복하는 루프:

```
1. 코드 수정
2. 브라우저 새로고침
3. 그 페이지로 이동
4. 버튼 눌러보고, 폼 채워보고
5. "어 잘 되네" / "어 콘솔 에러 떴네"
6. 다시 코드로
```

4~5번을 사람이 매번 하는 게 귀찮음. Claude한테 "확인해줘" 시켜도, Claude는 너의 브라우저를 못 봐서 알 수가 없음.

**이 플러그인은 Claude한테 "너의 브라우저를 보는 눈"을 달아준다.** Claude가 직접 페이지 상태를 읽고, 클릭하고, 폼 채우고, 콘솔 에러 검사하고, 결과를 보고함.

### Before / After

```
[이전]
너: "방금 바꾼 카드 배경색이 의도대로 적용됐는지 봐줘"
Claude: "코드상으론 className이 박혀있어 보입니다.
        실제 적용은 브라우저에서 확인해주세요."  ← Claude는 못 봄

[이후]
너: "방금 바꾼 카드 배경색이 의도대로 적용됐는지 봐줘"
Claude: (브라우저 직접 검사)
       ✅ PASS — 카드 배경 rgb(214, 234, 250) 적용 확인
       체크: bg-blue-weak 클래스 박힘 / computed bg 일치 / console 0
```

---

## 잘 쓰는 시나리오

### 1. Figma 디자인 → Tailwind로 옮긴 직후

```
너: "이 카드 컴포넌트 Figma 스펙대로 적용됐어?"
Claude: ✅ padding 16px / radius 12px / font-weight 500 / bg #d6eafa 일치
```

### 2. 다단계 인터랙션이 잘 동작하는지

```
너: "A 배너 텍스트 바꾸고 버튼 누르면 바텀시트 잘 떠?"
Claude: (page 이동 → 버튼 클릭 → 바텀시트 검증)
       ✅ 모달 열림 + 헤더 "신규 가입" 확인 + 인풋 3개
```

### 3. 코드 수정 후 회귀 없는지

```
너: "방금 변경이 다른 페이지 깨뜨리진 않았어?"
Claude: ✅ /dashboard / /settings / /profile — console 에러 0
```

### 4. 반복하는 검증을 task로 굳히기

로그인 → 대시보드 검증을 자주 한다면 한 번 만들어두고 다음부턴:

```
너: "로그인 task 돌려서 대시보드 확인해줘"
Claude: (저장된 task 실행, 결정적으로 보고)
```

매번 같은 검증을 동일한 결과로 돌릴 수 있음.

---

## 누구한테 잘 맞나

✅ **잘 맞는 사람**:
- React / Next.js 기반 웹앱 개발자
- Figma → Tailwind 워크플로 자주 쓰는 사람
- Claude Code로 코드 자주 수정하는 사람
- 작은 변경에도 회귀 자주 신경 쓰는 사람

❌ **별로 안 맞는 사람**:
- 시각 픽셀-정확 회귀가 본업인 사람 (Percy / Chromatic 영역)
- 비-React 환경 (작동은 하지만 일부 휴리스틱이 React 기반)
- 브라우저 자동화 자체가 처음이고 셋업 부담이 큰 경우

---

## 내부적으로 어떻게 동작하나 (관심 있으면)

LLM이 raw DOM을 매번 직접 살피게 하면 timing 민감 / flaky / 추론 비용 큼. 그래서 이 서버는 **결정적 layer**를 사이에 둔다:

- **`browser_semantic_state`** — `{ route, modal, primaryCTA, headings, errors, ... }`를 한 번에 추출
- **`browser_verify`** — 8개 state + 3개 style check를 배치로 평가, `expected vs observed` 구조화
- **`browser_run_task`** — multi-step flow를 1콜로 실행 (registered task 또는 inline steps)
- Playwright Locator + auto-retry로 클릭 결정성 확보
- Console / Network noise 자동 필터 (HMR, CareHubBridge 등)

**LLM은 "WHAT을 검증할지"만 결정**하고, **"HOW"(hydration / retry / 안정화)는 runtime이 처리**한다. 자세히는 [`docs/concepts.md`](./docs/concepts.md).

### `browser_verify` 한 콜이 안에서 도는 순서

검증 요청 하나가 들어오면 **① 추출 → ② 대기 → ③ 조회 → ④ 비교** 4단계로 처리한다:

1. **상태 한 번 추출** — 화면 공통정보(route · modal · errors · loading…)를 사진 1장처럼 한 번에 긁어둠. 여러 검사가 이걸 재활용(매번 다시 안 봄).
2. **필요하면 대기** — `loaded` 검사가 있는데 아직 로딩 중이면 0.15초씩 최대 `timeoutMs`까지 폴링. React 렌더 끝나기 전에 검사해서 생기는 flaky를 **코드가** 막음.
3. **DOM 한 콜로 조회** — `computed_style` · `class_present` 같은 UI 검사를 모아서 브라우저에 **딱 한 번** 질의(왕복 최소화 → 빠르고 저토큰).
4. **type별 기계 비교** — 검사마다 종류에 맞는 비교 코드로 `expected == observed` 대조. 하나라도 ❌면 전체 FAIL.

→ 이래서 **빠르고(왕복 적음) + 안 흔들리고(기계 비교) + flaky 없는(자동 대기)** 검증이 된다. 단계별 코드까지 보려면 [`docs/browser_verify-내부동작.md`](./docs/browser_verify-내부동작.md).

---

## Playwright MCP · agent-browser · 직접 코딩과 뭐가 다른가

브라우저에서 "이거 잘 됐나" 확인하는 걸 AI한테 시키는 방법은 여러 가지. 같은 결과를 내지만 **AI한테 얼마나 떠넘기느냐**가 다름.

먼저 용어 두 개만:
- **selector** — 페이지에서 특정 요소(버튼·입력칸 등)를 콕 집는 주소. 예: `버튼[data-slot=submit]`
- **flaky** — 같은 걸 돌려도 어떤 땐 통과, 어떤 땐 실패하는 불안정한 상태

| 질문 | **Playwright MCP** | **agent-browser** | **AI가 매번 직접 코딩** | **browser-verifier** |
|---|---|---|---|---|
| **AI가 실제로 뭘 하나?** | 페이지 목록(트리) 전체를 받아 AI가 읽고 통과/실패 판단 | 트리·스크린샷을 AI가 읽고 판단 (ref·CLI로 조작) | Playwright 코드를 그때그때 새로 짜고 → 실행 → 결과 해석 | "이 selector의 이 값을 확인해"라고 **지정만**. 확인은 미리 만든 코드가 함 |
| **확인하는 코드는 누가 만드나?** | 없음 (AI 판단) | 없음 (AI 판단) | AI가 매번 새로 작성하고 버림 | 이미 만들어져 고정. AI가 안 짬 |
| **"잠깐 기다렸다 확인"은?** | AI가 알아서 (놓치면 flaky) | CLI wait 명령, AI가 판단해 호출 | 코드에 매번 직접 넣어야 함 | 코드가 항상 알아서 기다림 |
| **같은 검증 두 번 하면 결과 같나?** | AI 판단이라 흔들림 | AI 판단이라 흔들림 | 매번 코드 달라서 **제일 들쑥날쑥** | **항상 같은 결과** |
| **한 번 돌릴 때 비용** | 트리 전체 읽어 무거움 | 트리·스크린샷 읽어 무거움 (실행은 Rust라 빠름) | 코드 매번 생성해 무거움 | 확인할 값만 봐서 가벼움 |
| **정확한 값(CSS px·색) 판정?** | △ 트리에 값 거의 없음 | △ 똑같이 눈대중 (트리에 값 없음) | ✅ 가능 (직접 짜야) | ✅ 코드가 정밀 비교 |
| **브라우저 폭** | Chromium·WebKit·Firefox | Chromium·**Safari·Lightpanda** | (Playwright와 같음) | **Chromium만** (CDP attach) |
| **다음에 또 쓸 수 있나?** | 안 됨 | 안 됨 (CLI 1회성) | 안 됨 (코드 버림) | 저장해 똑같이 반복 |
| **어디에 잘 맞나?** | 사이트 탐색 | 탐색·멀티브라우저·Vision 시각확인 | 한 번만 할 특이 조작 | 코드 고친 뒤 **결정적 회귀 검증** |

> **agent-browser는?** Playwright MCP와 **같은 "AI 판정" 계열**이에요 (트리·스크린샷을 AI가 읽고 판단). 차별점은 **Rust CLI(빠른 실행)·멀티 브라우저(Safari·Lightpanda)·Vision 시각 확인**. 단 **CSS px·색 같은 정밀 값은 접근성 트리에 안 나와서** 똑같이 눈대중이라, *"버튼이 작동하나"* 같은 유무 판단엔 강해도 *"마진이 정확히 16px인가"* 정밀 판단엔 약해요. 그 값을 코드로 정밀 비교하는 건 browser-verifier뿐.

### 한눈에

- **Playwright MCP · agent-browser** → AI가 *읽기 + 판단*까지 다 함 (트리·스크린샷). 무겁고, 판단이라 흔들림. (agent-browser는 Rust 실행·멀티브라우저·Vision이 강점)
- **AI 직접 코딩** → AI가 *코드 작성 + 실행 + 판단*까지 다 함. 매번 코드가 달라져서 **제일 불안정**.
- **browser-verifier** → AI는 *무엇을 볼지*만, 기다림·재시도·합격판정은 **고정된 코드**가 함. 그래서 가볍고, 매번 같은 결과.

특히 **"AI가 매번 직접 코딩"**의 함정을 콕 집으면:
- 같은 검증인데 실행할 때마다 코드가 미묘하게 달라짐 → 어제 통과한 게 오늘 깨짐
- 기다리는 처리를 매번 기억해서 넣어야 함 → 한 번 빼먹으면 flaky
- 검증 끝나면 코드는 버려짐 → 쌓이지 않음

browser-verifier는 이 *"매번 새로 짜는"* 부분을 **이미 검증된 코드로 고정**해두고, AI한테는 *"이 selector의 이 값을 봐"* 정도만 시킴.

---

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
- `browser_verify({ checks })` — 한 콜에 다중 **assertion**. 12 check 종류 (8 state + 3 style + figma_spec).
  - state: `primary_cta`, `no_errors`, `loaded`, `route`, `modal_open`, `modal_closed`, `heading_present`, `input_count`
  - style (batched DOM): `computed_style`, `class_present`, `class_absent`
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

11 ops: `goto` · `click` · `fill` · `navigate` · `reload` · `wait_url` · `wait_text` · `wait_selector` · `wait_load` · `verify` · `screenshot`. `{{argName}}` 템플릿 치환 + bail-on-error.

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

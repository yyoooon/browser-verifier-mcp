# browser-verifier-mcp

Claude Code 같은 MCP 클라이언트에서 동작하는 **결정적 브라우저 검증 서버**. Playwright `connectOverCDP`로 이미 떠 있는 Chrome 9223에 붙어서, 라이브 페이지 상태를 구조화된 JSON으로 확인하고, 다단계 인터랙션을 1콜로 실행한다.

LLM에게 "WHAT을 검증할지"만 시키고, "HOW"(hydration / retry / 안정화)는 runtime이 처리한다.

> **AI / 브라우저 자동화 / MCP를 처음 다룬다면** → [`docs/concepts.md`](./docs/concepts.md) 부터 읽으면 됨. 이 프로젝트가 "왜" 이런 모양인지 개념부터 설명함.

---

## 왜 쓰나

LLM이 `browser_eval`로 매번 IIFE 짜서 raw DOM dump하면:
- timing 민감 (React rerender → stale 클릭)
- 같은 검증 두 번 돌리면 결과 다름 (flaky)
- 실패 메시지 free-form, "왜?"를 LLM이 추론해야 함

이 MCP 서버는:
- **`browser_semantic_state`** — `{ route, modal, primaryCTA, headings, errors, ... }`를 한 번에
- **`browser_verify`** — 8개 state + 3개 style check를 배치로 평가, `expected vs observed` 구조화
- **`browser_run_task`** — multi-step flow를 1콜로 실행 (registered task 또는 inline steps)
- Playwright Locator + auto-retry로 클릭 결정성 확보
- Console / Network noise 자동 필터 (HMR, CareHubBridge 등)

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

`~/.zshrc` (또는 `.bashrc`)에 alias:

```bash
alias chrome-debug='/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-9223 &'
```

이후 검증할 때마다:
1. dev 서버 실행 (예: `yarn dev` → `localhost:3000`)
2. `chrome-debug`로 새 Chrome 인스턴스 띄움
3. 그 Chrome에서 `localhost:3000` 직접 열기

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

## 14개 도구

### Lifecycle
- `browser_setup({ port? })` — 사이클 시작. Chrome 9223 + localhost:port 탭에 연결.
- `browser_tab_list()` — Chrome 9223의 모든 page target.
- `browser_sentinel_save({ projectRoot? })` — `.claude/.last-verified-hash` 작성, Stop hook 루프 차단.

### Inspection
- `browser_semantic_state()` — 페이지 상태 한 번에: route / title / loading / modal / primaryCTA / headings / errors / inputCount / focusedElement.
- `browser_get_url()` — 현재 URL.
- `browser_is_visible({ selector })` — DOM + clientRect + computed style 가시성.

### Verification
- `browser_verify({ checks })` — 한 콜에 다중 assertion. 8 state + 3 style check 종류.
  - state: `primary_cta`, `no_errors`, `loaded`, `route`, `modal_open`, `modal_closed`, `heading_present`, `input_count`
  - style (batched DOM): `computed_style`, `class_present`, `class_absent`
- `browser_check_console({ level?, clear? })` — 콘솔 버퍼 (노이즈 자동 필터).
- `browser_check_network({ status?, urlContains? })` — 네트워크 버퍼 (default: errors).

### Tasks (multi-step flow)
- `browser_load_tasks({ path })` — JSON tasks 파일 로드.
- `browser_list_tasks()` — 로드된 task 메타데이터.
- `browser_run_task({ name?, steps?, args? })` — 두 모드: registered task by `name`, 또는 inline `steps`.

### Escape / Media
- `browser_eval({ script, timeoutMs? })` — Raw JS. semantic_state / verify로 표현 불가능할 때만.
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

디자인 spec 적용 후 결정적 회귀 검증:

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
- [`skills/verify/references/figma-tailwind-check.md`](./skills/verify/references/figma-tailwind-check.md) — Figma 검증
- [`skills/verify/references/token-check.md`](./skills/verify/references/token-check.md) — 토큰 적용 검사

---

## 잘 잡힘 / 못 잡힘

✅ 결정적으로 잡힘:
- 잘못된 Tailwind 클래스 / spacing / font-weight
- 토큰 적용 여부 (classList + computed)
- 라우트 변경 / 모달 열림-닫힘
- console / network 에러
- React 컨트롤드 input 채우기 (native setter fallback)

❌ 못 잡음 (별도 도구 필요):
- 1-2px pixel-perfect 회귀 → Percy / Chromatic
- hover / focus / 다크모드 상태 매칭
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

---

## License

MIT — [`LICENSE`](./LICENSE) 참고.

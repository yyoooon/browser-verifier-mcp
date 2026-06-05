# browser-verifier는 왜, 누구를 위해, 무엇을 위해 만들어졌나

> "이 MCP가 왜 필요하고, 어떤 방법으로, 무엇을 위해 만들어졌는지, 기존 테스트
> 라이브러리나 Playwright MCP와 뭐가 다른지" 한 번에 정리한 문서.
> 더 쉬운 비유 버전은 [`쉽게-이해하기.md`](./쉽게-이해하기.md) 참고.

---

## 한 문장 답

> **개발하다가 코드 고친 직후, "이거 진짜 화면에서 잘 됐나?"를 Claude가
> 네가 보던 그 브라우저에서 빠르고 일관되게 확인해주게 만든 MCP.**

판정은 **AI 눈대중이 아니라 코드**가 하고, 검증에 필요 없는 기능은 다 쳐냈어요.

---

## 1. 누가 필요한가

| 잘 맞는 사람 | 안 맞는 사람 |
|--------------|--------------|
| React / Next.js 웹앱 개발자 | 픽셀-정확 시각 회귀가 본업 (→ Percy/Chromatic) |
| Figma → Tailwind 작업 자주 함 | 비-React 환경 (휴리스틱이 React 기반) |
| Claude Code로 코드 자주 고침 | 임의 사이트 자동화/스크래핑이 목적 (→ Playwright MCP) |
| 작은 변경에도 회귀 신경 씀 | |

---

## 2. 왜 필요한가 (푸는 문제)

웹 개발은 이 루프를 계속 돌아요:

```
1. 코드 수정
2. 브라우저 새로고침
3. 그 페이지로 이동
4. 버튼 눌러보고, 폼 채워보고
5. "어 잘 되네" / "어 콘솔 에러 떴네"
6. 다시 코드로
```

4~5번을 사람이 매번 하는 게 귀찮아요. 근데 Claude한테 "확인해줘" 시켜도,
**Claude는 네 브라우저를 못 봐서** 알 수가 없어요.

```
[이전]
너:     "방금 바꾼 카드 배경색 잘 적용됐어?"
Claude: "코드상으론 className이 박혀 보입니다.
        실제 적용은 브라우저에서 확인해주세요."   ← 못 봄

[이후 — 이 MCP 설치]
너:     "방금 바꾼 카드 배경색 잘 적용됐어?"
Claude: (브라우저 직접 검사)
        ✅ PASS — 카드 배경 rgb(214, 234, 250) 확인
        체크: bg-blue-weak 클래스 박힘 / computed bg 일치 / console 0
```

→ **이 MCP는 Claude한테 "네 브라우저를 보는 눈"을 달아줘요.**

---

## 3. 어떤 방법으로 동작하나

핵심 설계: **"LLM은 WHAT만, 런타임이 HOW를 처리"**

- **WHAT** (무엇을 검증할지) = AI가 정함
- **HOW** (hydration 대기 / retry / 안정화) = 미리 짜둔 코드가 처리

### 동작 4단계

```
1. 너:        "버튼 글자 '저장' 맞는지 봐줘"          (사람 말)
2. Claude:    { type:"computed_style"... } 규칙으로 통역  (WHAT)
3. 플러그인:   Playwright로 실제 화면에서 값 꺼냄         (HOW)
4. 코드:      기대값 == 실제값 비교 → ✅/❌              (판정도 코드)
```

AI가 하는 건 **2번(규칙 작성)까지**. 실제 조회·비교·판정은 전부 코드예요.

### 예시 ① — 페이지 상태 한 번에 확인

```ts
browser_semantic_state()
// →
{
  route: "/partners",
  loading: false,
  modal: null,
  primaryCTA: { text: "제휴업체 등록", visible: true, enabled: true },
  headings: ["제휴업체 목록"],
  errors: [],
  inputCount: 0
}
```

### 예시 ② — 다중 검증을 한 콜에 (assertion)

```ts
browser_verify({
  checks: [
    { type: "route", expected: "**/dashboard" },
    { type: "loaded", timeoutMs: 3000 },
    { type: "no_errors" },
    { type: "heading_present", text: "건강 지표" },
    // Figma → Tailwind 적용 검증
    { type: "class_present",  selector: "[data-slot=card]", className: "bg-[#d6eafa]" },
    { type: "computed_style", selector: "[data-slot=card]", prop: "padding", expected: "16px" },
  ]
})
// → ✅ PASS — 6/6 통과 (1.2s)
```

### 예시 ③ — 반복 흐름을 task로 굳히기

`.browser-verifier/tasks.json`:

```json
{
  "performLogin": {
    "args": ["email", "password"],
    "steps": [
      { "op": "goto",   "url": "http://localhost:3000/login" },
      { "op": "fill",   "selector": "input[name=email]",    "value": "{{email}}" },
      { "op": "fill",   "selector": "input[name=password]", "value": "{{password}}" },
      { "op": "click",  "text": "로그인" },
      { "op": "wait_url", "pattern": "**/dashboard" },
      { "op": "verify", "checks": [{ "type": "no_errors" }] }
    ]
  }
}
```

다음부턴 한 줄로 결정적 재실행:

```ts
browser_run_task({ name: "performLogin", args: { email: "...", password: "..." } })
```

---

## 4. 무엇을 위해 만들어졌나 (목적)

```
좁힘    → 검증 한 가지에 집중, 잡기능 제거
결정적  → 판정을 코드가 → 항상 같은 결과 (flaky 없음)
라이브  → 네가 보던 화면에 붙음 (개발 시점 특화)
저비용  → 토큰·왕복 적음, 빠름
```

> 한 문장: **"개발 중 검증"이라는 한 가지 일에만 집중해서, 흔들리면 안 되는
> 판정은 코드에 맡기고, AI에겐 규칙 작성만 남겨, 불필요한 조작·도구를 쳐낸
> 빠르고 결정적인 검증 도구.**

---

## 5. 기존 테스트 라이브러리(Playwright test / Cypress)와 뭐가 다른가

테스트 라이브러리도 "코드가 판정"해요. 그건 같아요. **다른 건 쓰는 자리와 무게.**

| | 테스트 라이브러리 | browser-verifier |
|---|---|---|
| 코드 작성 | 사람이 **미리 다 짬** | **자연어로** 시키면 됨 |
| 실행 환경 | **새 브라우저** 격리 실행 | **네 라이브 화면**에 붙음 |
| 결과물 | `.spec.ts` (CI 영구 자산) | 즉석 검증 (또는 task JSON) |
| 무게 | 정식 요리 🍲 | 라면 🍜 |
| 적합한 때 | 영구 회귀 방어망, CI | 개발 중 "지금 됐나?" 빠른 확인 |

### 코드로 비교

```ts
// [테스트 라이브러리] — 미리 다 짜야 하고, 빈 브라우저에서 처음부터
test('대시보드 로딩', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name=email]', 'a@b.com')
  await page.fill('[name=password]', 'pw')
  await page.click('text=로그인')
  await page.waitForURL('**/dashboard')   // 타이밍 직접 관리
  await expect(page.getByText('건강 지표')).toBeVisible()
})

// [browser-verifier] — 네가 이미 로그인 해둔 그 화면에서 바로
browser_verify({
  checks: [
    { type: "route", expected: "**/dashboard" },
    { type: "heading_present", text: "건강 지표" },
    { type: "no_errors" },
  ]
})
```

> 둘은 경쟁이 아니에요. **즉석 검증(browser-verifier)으로 흐름 확인 → 그걸
> 씨앗으로 `.spec.ts` 생성**하면, 셀렉터 추측(환각)이 줄어 더 정확해요.

---

## 6. Playwright MCP와 뭐가 다른가

같은 Playwright 엔진을 쓰지만 **목적과 "판정 주체"가 달라요.**

| | browser-verifier | Playwright MCP |
|---|---|---|
| 목적 | 코드 수정 후 **검증** | 범용 브라우저 **자동화** |
| 브라우저 | 네 라이브 화면에 **붙음** | 보통 **새로 띄움**(격리) |
| 화면 읽기 | 필요한 값만 **콕** (DOM 직접) | 접근성 트리 **통째로** AI에 |
| **판정** | **코드가** ✅ | **AI가** snapshot 읽고 🧠 |
| 속도·비용 | 빠르고 토큰 적음 | 느리고 토큰 많음 |
| 조작 범위 | 검증용 최소 (click/fill/…) | 드래그·hover·파일·탭 등 풀세트 |

### "판정 누가 하나"가 핵심 — 코드로 비교

```ts
// [browser-verifier] 판정 = 코드
browser_verify({
  checks: [{ type:"computed_style", selector:"[data-slot=card]", prop:"padding", expected:"16px" }]
})
// 코드가 "16px" == 실제값 비교 → ✅/❌  (항상 일정)

// [Playwright MCP] 판정 = AI
browser_snapshot()
// → 접근성 트리(글)를 AI에 떠다 줌
// → AI가 읽고 "음 카드가 있네... padding은 트리에 안 나오는데?" (CSS 값은 잘 안 보임, 판단 흔들림)
```

### 언제 뭘 쓰나

| 상황 | 추천 |
|------|------|
| Figma→Tailwind 검증, 코드 수정 후 회귀 체크 | **browser-verifier** |
| React/Next에서 같은 검증 반복 | **browser-verifier** (task) |
| 임의 사이트 조작, 스크래핑, 탐색적 E2E, 파일/멀티탭 | **Playwright MCP** |
| 픽셀 단위 시각 회귀 | 둘 다 아님 → Percy/Chromatic |

---

## 7. 한 줄 요약

> **browser-verifier = "개발 중 내 React 화면, 방금 고친 거 됐나?"를 코드가
> 결정적으로 판정해주는 검증 특화 MCP.**
>
> - 기존 테스트 라이브러리: 같은 "코드 판정"이지만 **미리 다 짜는 영구 자산**(CI용). 이건 **자연어 즉석 검증**.
> - Playwright MCP: 같은 엔진이지만 **AI가 판정하는 범용 자동화**. 이건 **코드가 판정하는 검증 특화**.
>
> 셋은 경쟁이 아니라 **자리가 달라요.** 검증이냐 vs 조작이냐 vs 영구 자산이냐. 😊

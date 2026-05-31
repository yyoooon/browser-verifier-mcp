# Task Workflow

## 1회성 인터랙션+검증 — inline steps (파일 X)

PR마다 다른 변경 → 다른 검증인 경우. 파일 생성 / commit 부담 없이 한 콜:

```
browser_run_task({
  "steps": [
    { "op": "goto", "url": "http://localhost:3000/banner" },
    { "op": "verify", "checks": [
        { "type": "heading_present", "text": "새 배너 텍스트" },
        { "type": "class_present", "selector": "[data-slot=banner-a]", "className": "bg-primary" }
    ]},
    { "op": "click", "text": "자세히 보기" },
    { "op": "wait_selector", "selector": "[role=dialog]", "timeoutMs": 2000 },
    { "op": "verify", "checks": [
        { "type": "modal_open" },
        { "type": "class_present", "selector": "[data-slot=bs-cta]", "className": "bg-primary" },
        { "type": "computed_style", "selector": "[data-slot=bs-cta]", "prop": "fontWeight", "expected": "600" }
    ]}
  ]
})
```

- 결과는 step-by-step 구조화 — 어느 step에서 실패했는지 즉답
- Locator-retry / stabilization 그대로 (runner가 처리)
- 잘 동작하면 그대로 복붙해서 tasks.json에 task로 굳혀도 됨

## Existing task로 실행

```
1. browser_setup({ port })
2. (project tasks auto-loaded via $PWD/.browser-verifier/tasks.json)
3. browser_run_task({ name: "performLogin", args: { email, password } })
4. browser_verify({ checks: [{ type: "route", expected: "**/dashboard" }, ...] })
5. browser_check_console + browser_sentinel_save
```

## 새 task 작성 — lazy creation 패턴 (LLM 자동)

사용자가 자연어로 반복 가능한 flow를 요청하면 LLM이 자동 수행:

1. **Read 컴포넌트 코드** — 라우트, selector, 버튼 텍스트 확인
2. (필요 시) `browser_semantic_state` / `browser_eval`로 라이브 인스펙트
3. `$PWD/.browser-verifier/tasks.json` 존재 확인
   - **없음** → Write 툴로 디렉토리 + 파일 생성, 새 task를 포함한 JSON 작성
   - **있음** → Read → 새 task 추가 → Write로 덮어쓰기
4. `browser_load_tasks({ path: "$PWD/.browser-verifier/tasks.json" })` 리로드
5. `browser_run_task`로 실행 → 결과 확인
6. 보고에 **"📝 새 task `<name>` 추가됨 — review 후 commit 권장"** 1줄 포함

## "반복 가능한 flow"의 판단 기준

다음 중 하나라도 해당하면 task로 작성:

- 사용자가 동일 단어로 두 번 이상 요청한 flow ("로그인 후 ~ 다시 확인")
- 인증 / 다단계 폼 / 모달 열기 / 회원가입 같은 보편적 user flow
- 사용자가 명시적으로 "task로 만들어줘" / "재사용할 거야"
- regression suite 후보 (PR마다 굴릴 만한 검증)

한 줄짜리 assertion이나 ad-hoc 인스펙션은 task로 만들지 않음 — `verify` / `eval`로 끝.

## Task JSON 포맷

```json
{
  "taskName": {
    "description": "사람을 위한 설명 (옵션)",
    "args": ["arg1", "arg2"],
    "steps": [
      { "op": "goto", "url": "/login" },
      { "op": "fill", "selector": "...", "value": "{{arg1}}" },
      { "op": "click", "text": "로그인" },
      { "op": "navigate", "clickText": "Save", "expectedUrl": "**/dashboard" },
      { "op": "wait_selector", "selector": "[role=dialog]", "timeoutMs": 3000 },
      { "op": "verify", "checks": [{ "type": "modal_open", "expectedTitle": "..." }] },
      { "op": "screenshot", "name": "after-save" }
    ]
  }
}
```

ops: `goto` · `click` · `fill` · `navigate` · `reload` · `wait_url` · `wait_text` · `wait_selector` · `wait_load` · `verify` · `screenshot`.

전체 예시: `templates/tasks.example.json`.

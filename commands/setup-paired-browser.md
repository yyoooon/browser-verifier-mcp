---
description: Interactive setup wizard — pair browser-verifier with agent-browser via shared Chrome CDP
---

browser-verifier ↔ agent-browser 페어링을 처음 셋업하는 인터랙티브 가이드. 4개 질문을 **순서대로** 묻고 (한 번에 묶지 X), 답변에 따라 설치/설정/검증까지 진행합니다.

도구는 `AskUserQuestion`을 사용하세요. 답변을 받기 전엔 다음 단계로 가지 마세요.

---

## Q1 — 사용 모드

```
질문: 어떤 모드로 사용하시겠어요?
옵션:
  A. AI-driven 페어 (권장) — AI가 클릭/입력하면서 검증
  B. 수동 QA — 직접 Chrome 다루고 검증만 자동화
  C. Task-driven — 사전 정의 task 회귀만
```

**저장**: `MODE = A | B | C`

---

## Q2 — agent-browser 설치 (MODE = A 또는 C일 때만)

MODE = B면 이 단계를 건너뛰고 Q3로.

```
질문: agent-browser 설치 위치는?
옵션:
  G. Global (npm i -g agent-browser) — 디폴트, 모든 프로젝트에서 사용
  P. Project local (npm i -D agent-browser) — 이 프로젝트의 package.json에 기록
  S. Skip — 이미 설치되어 있거나 직접 설치
```

**저장**: `INSTALL = G | P | S`

---

## Q3 — CDP 포트

```
질문: Chrome CDP 포트는?
옵션:
  D. 9223 (디폴트, 권장)
  C. 다른 포트 직접 입력
```

C를 고르면 추가로 자유 입력 받기 — 1~65535 사이 숫자.

**저장**: `PORT = 9223 또는 사용자 입력값`

---

## Q4 — CLAUDE.md 룰 위치

```
질문: 브라우저 사용 규칙(CLAUDE.md)을 어디에 작성할까요?
옵션:
  P. 프로젝트 (./CLAUDE.md) — 이 프로젝트만
  G. 글로벌 (~/.claude/CLAUDE.md) — 모든 프로젝트
  B. 둘 다
  N. 안 만듦
```

**저장**: `RULE = P | G | B | N`

---

## 실행 단계 (모든 답변 수집 후)

### Step 1 — agent-browser 설치

`INSTALL = G`:
```bash
npm i -g agent-browser
```

`INSTALL = P`:
현재 디렉토리에 `package.json`이 있는지 확인. 있으면:
```bash
npm i -D agent-browser
```
없으면 사용자에게 "프로젝트 디렉토리에서 다시 실행하거나 G(global) 선택" 안내 후 종료.

`INSTALL = S`: 설치 건너뛰고 `which agent-browser`로 설치 여부만 확인. 없으면 경고만 남기고 진행.

MODE = B: 이 step 전체 skip.

### Step 2 — Chrome launch

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/launch-chrome.sh" {{PORT}}
```

스크립트 출력을 그대로 보고. 실패하면 후속 step 진행하지 말고 사용자에게 문제 보고.

### Step 3 — CLAUDE.md 작성

템플릿 경로: `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template`

템플릿 내용에서 `{{PORT}}`를 사용자가 고른 PORT로 모두 치환한 뒤 다음 위치에 작성:

- `RULE = P`: `./CLAUDE.md`
- `RULE = G`: `~/.claude/CLAUDE.md`
- `RULE = B`: 둘 다
- `RULE = N`: skip

이미 파일이 존재하면 **덮어쓰지 말고** 사용자에게 한 줄로 확인 받기.

### Step 4 — 검증 (best-effort)

`browser_setup({ cdpPort: <PORT> })`로 연결 확인.

dev server 포트를 사용자가 안 알려줬으니 인자 생략 (auto-detect 시도). 실패하면 "dev server 띄운 뒤 browser_setup 으로 검증하세요" 안내.

---

## 최종 보고

다음 표 형식으로 한 번에 보고:

| 항목 | 결과 |
|---|---|
| 사용 모드 | A / B / C |
| agent-browser | 설치 결과 (또는 skip) |
| CDP 포트 | {{PORT}} |
| Chrome | ✓ Running on :{{PORT}} 또는 ❌ |
| CLAUDE.md | 작성된 파일 경로 (또는 skip) |
| MCP 연결 | ✓ 성공 또는 ⚠️ dev server 안 떠있음 |

마지막 줄에 다음 안내:
- `MODE = A`: "이제 'agent-browser --cdp {{PORT}} open <url>' 후 browser_verify로 검증하세요."
- `MODE = B`: "Chrome 창에서 직접 페이지 띄우고 browser_verify로 검증하세요."
- `MODE = C`: "`.browser-verifier/tasks.json` 정의 후 browser_run_task 호출."

# Category Selection (무엇을 검증할지)

Tier(얼마나)와 직교 축. diff 패턴에서 어떤 검증 카테고리를 켤지 set으로 산출.

## 카테고리

| 코드 | 이름 | 주력 도구 |
|---|---|---|
| **1-a** | 시각 sanity | `browser_screenshot` + Read |
| **1-b** | 토큰 / 렌더 원인 분석 | `browser_eval`로 classList + computed style 추출 |
| **2** | 단일 액션 (click → 모달/URL) | `browser_verify`(`route` / `modal_open`) 또는 `browser_run_task` |
| **3** | 멀티스텝 (5+ 단계) | `browser_run_task` (없으면 작성) |
| **4** | 네트워크/콘솔 | `browser_check_console` + `browser_check_network` |

**cat 4 (console + network)는 항상 디폴트 포함** — 거의 free, silent 버그 잡음.

## diff 패턴 → 카테고리

| 변경 패턴 | 카테고리 |
|---|---|
| Tailwind className / 색 / `tokens.css` 변경 | **1-a** + **1-b** |
| 인라인 `style={{ ... }}` 에 CSS 변수/색상 변경 | **1-b** (classList 불가, computed 비교) |
| applying-figma-designs 스킬을 탄 작업 | **1-b** 무조건 (Figma 스펙 vs computed) |
| 새 JSX mount / 조건부 렌더 | **1-a** |
| 새 `onClick` / 핸들러 (navigation 없음) | **2** |
| `router.push` 인자 변경 / link href / nav 트리거 | **2** (`verify({route})` 또는 task) |
| 폼/입력/다단계 모달 (같은 페이지 내) | **3** (task) |
| 폼 submit → 페이지 전환 | **3** (task: fill → navigate → verify) |
| API / mutation / queries / fetch 변경 | **4** |
| `useEffect` 초기 mount fetch | **4** + **1-a** + `verify({loaded})` |

## 실행 압축

cat set 결정 후 호출 수 최소화:

| 그룹 | 카테고리 | 호출 |
|---|---|---|
| **A. 한 콜에 묶기** | 1-b, 2, 일부 3 | `browser_verify` 1콜 또는 `browser_eval` IIFE 1콜 |
| **B. 사이드 콜** | 4 | `check_console` + `check_network` (각 ~1ms) |
| **C. 스크린샷 + Read** | 1-a | `browser_screenshot` 1콜 + Read |
| **D. 재사용 flow** | 3 | `browser_run_task` 1콜 (multi-step 내부 처리) |

5개 카테고리 다 켜져도 **A(1콜) + B(2콜) + C(1콜 + Read) = 4 MCP 콜.** flow가 task로 정의돼 있으면 그 1콜이 A를 대체.

## 산출 예시

### 예시 1 — 토큰 + 폼 변경

```
diff: src/app/record/_components/WeightForm.tsx + src/styles/tokens.css

탐지:
  - tokens.css 변경 → cats += {1-a, 1-b}
  - 새 <form> + setReactValue → cats += {3}
  - useMutation 호출 → cats += {4}

cats = {1-a, 1-b, 3, 4}

실행:
  1. browser_run_task({ name: "submitWeightForm", args: {...} })  # cat 3
  2. browser_eval (token classList / computed)  # cat 1-b
  3. browser_check_console + browser_check_network  # cat 4
  4. browser_screenshot + Read  # cat 1-a
```

### 예시 2 — 단순 nav 트리거

```
diff: src/app/.../SidebarItem.tsx — href 변경

탐지:
  - href 변경 → cats += {2}
  - 새 컴포넌트 없음, API 변경 없음

cats = {2, 4(default)}

실행:
  1. browser_verify({ checks: [
       { type: "route", expected: "**/new-route" },
       { type: "no_errors" },
     ]})
  2. browser_check_console
```

대부분의 cat 2는 task를 따로 정의할 필요 없이 `browser_verify` 한 콜로 끝남.

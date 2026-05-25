# Category Selection (무엇을 검증할지)

Tier(얼마나)와 직교 축. diff 패턴에서 어떤 검증 카테고리를 켤지 set으로 산출.

## 카테고리

| 코드 | 이름 | 도구 |
|---|---|---|
| **1-a** | 시각 sanity | `browser_screenshot` + Read |
| **1-b** | 렌더 원인 분석 | `browser_eval`로 classList + computed style 추출 |
| **2** | 단일 액션 (click → 모달/URL) | `browser_navigate` 또는 `browser_batch` |
| **3** | 멀티스텝 (5+ 단계) | `browser_batch` + `browser_fill_input` 조합 |
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
| `router.push` 인자 변경 / link href / nav 트리거 | **2** (`browser_navigate`) |
| 폼/입력/다단계 모달 (같은 페이지 내) | **3** |
| 폼 submit → 페이지 전환 | **3** (`fill_input` + `batch`) |
| API / mutation / queries / fetch 변경 | **4** |
| `useEffect` 초기 mount fetch | **4** + **1-a** |

## 실행 압축

cat set 결정 후 호출 수 최소화:

| 그룹 | 카테고리 | 호출 |
|---|---|---|
| **A. Eval IIFE 1콜** | 1-b, 2, 3 | DOM-side 전부 한 IIFE 또는 batch |
| **B. 사이드 콜** | 4 | `check_console` + `check_network` 2콜 (~1ms 각) |
| **C. 스크린샷 + Read** | 1-a | `browser_screenshot` 1콜 + Read |

5개 카테고리 다 켜져도 **A(1콜) + B(2콜) + C(1콜 + Read) = 4 MCP 콜.**

## 산출 예시

```
diff: src/app/record/_components/WeightForm.tsx + src/styles/tokens.css

탐지:
  - tokens.css 변경 → cats += {1-a, 1-b}
  - 새 <form> + setReactValue → cats += {3}
  - useMutation 호출 → cats += {4}

cats = {1-a, 1-b, 3, 4}

실행:
  1. browser_batch / fill_input — cat 3 (입력) + cat 1-b 인라인 (classList/computed 검사)
  2. browser_check_console + browser_check_network — cat 4
  3. browser_screenshot + Read — cat 1-a
```

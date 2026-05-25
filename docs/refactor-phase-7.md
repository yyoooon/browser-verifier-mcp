# Phase 7 — Style Verification Checks

리팩터 보너스 단계. Figma MCP → Tailwind 워크플로의 정확도를 높이기 위해 `browser_verify`에 스타일 검증 check 3종 추가.

## 추가 사항

### `VerifyCheck` 확장

```ts
| { type: "computed_style"; selector: string; prop: string; expected: string }
| { type: "class_present"; selector: string; className: string }
| { type: "class_absent"; selector: string; className: string }
```

### 실행 모델

기존 state 기반 check(`primary_cta`, `route`, ...)는 `extractSemanticState` 한 콜에서 모두 평가. 신규 DOM 기반 check는 **별도 batched `page.evaluate`** 한 콜로 전체 selector를 한꺼번에 query. 즉 verify 한 호출당 최대 **2 roundtrip** (semantic snapshot + DOM batch) — check 개수와 무관하게 일정.

`prop`은 camelCase(`backgroundColor`)와 kebab-case(`background-color`) 모두 지원. 내부에서 `cs[prop]` 우선 시도 후 비어있으면 `cs.getPropertyValue(kebab)` fallback.

### MCP 표면

`browser_verify`의 description에 스타일 check 3종 + Tailwind v4 OKLCH 함정 + 브라우저 정규화 노트 추가. inputSchema의 `type` enum에 신규 3개 추가. **MCP 툴 개수 14개 변함 없음.**

## 신규 doc

### `skills/references/figma-tailwind-check.md`

Figma MCP → Tailwind 워크플로 전용 가이드. 내용:

- 기본 패턴 — verify check 3종 매핑
- 표준 흐름 (Figma spec → Tailwind 구현 → verify check 작성)
- 브라우저 정규화 표 (`#d6eafa` → `rgb(214, 234, 250)`, `1rem` → `16px`, `medium` → `500` 등)
- **Tailwind v4 OKLCH 함정** — theme 컬러는 `oklch()`, arbitrary value(`bg-[#hex]`)는 rgb 유지
- **처음 토큰 캡처 패턴** — theme 토큰 검증 시 첫 호출에서 `browser_eval`로 컴퓨티드 값 캡처 → expected에 박음 → 이후 회귀 감지
- 잘 잡힘 / 못 잡힘 정리
- 자주 쓰는 prop 레퍼런스 (Fill, Stroke, Border, Padding, Margin, Gap, Font 등)

### `skills/references/token-check.md` 갱신

기존 "1차 classList / 2차 computed"에서 → "1차 verify check / 2차 eval"로 우선순위 재정의. eval은 처음 토큰 캡처나 디버깅용으로 한정. figma-tailwind-check.md로 cross-link.

### `skills/SKILL.md` 갱신

- `browser_verify` tool 행에 신규 3 check 명시
- Category Selection 표에 Tailwind / Figma 적용 시 verify(class_present + computed_style) 우선 권장
- References 섹션에 figma-tailwind-check.md 추가

## 검증 — 2026-05-25

localhost:3000 /partners 실제 element로 4 시나리오:

| Scenario | 결과 |
|---|---|
| 5 긍정 (class_present + 4 computed_style) | 5/5 PASS, 7ms |
| 4 실패 (잘못된 rgb / 없는 class / 잘못된 absent / 없는 selector) | 4/4 FAIL, delta 메시지 정확 |
| kebab-case `background-color` + camelCase `backgroundColor` | 동일 결과 |
| class_absent 정상 케이스 | PASS |

대표 실패 메시지:
- `backgroundColor: expected "rgb(999, 999, 999)" got "rgba(0, 0, 0, 0)"`
- `class "definitely-not-a-class" not present on "button"`
- `class "flex" unexpectedly present on "button"` (class_absent 실패)
- `selector "[data-no-such-element-xyz]" not found`

5 check가 7ms — batched 1 DOM roundtrip 확인.

## Figma → Tailwind 워크플로 결과

이 phase 후 사용자 흐름:

```
1. Figma MCP에서 spec 받음 (color: #D6EAFA, padding: 16px, font-weight: 500)
2. LLM이 Tailwind 작성 (bg-[#d6eafa] p-4 font-medium)
3. 검증 — task 또는 verify 한 콜:
   {
     "checks": [
       { "type": "class_present", "selector": "[data-slot=card]", "className": "bg-[#d6eafa]" },
       { "type": "computed_style", "selector": "[data-slot=card]", "prop": "backgroundColor", "expected": "rgb(214, 234, 250)" },
       { "type": "computed_style", "selector": "[data-slot=card]", "prop": "padding", "expected": "16px" },
       { "type": "computed_style", "selector": "[data-slot=card]", "prop": "fontWeight", "expected": "500" }
     ]
   }
4. 첫 회 보통 task로 굳혀짐 (lazy creation 패턴). 이후 회귀는 task name 1콜.
```

## Phase 7 종료 상태

- runtime primitives: 변동 없음 (verify runtime이 한 layer 더 풍부해짐)
- MCP 툴: **14개 변함 없음** (browser_verify 내부 check 종류만 8→11개)
- `browser_verify` check 종류: 8 state + 3 DOM = **11종**
- 외부 사용자 표면: 호환. 기존 task / verify 호출 모두 정상.

리팩터 Phase 1~7 모두 종료.

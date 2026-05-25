# Figma → Tailwind Verification

Figma MCP에서 받은 디자인 spec을 Tailwind로 구현한 뒤, **실제 렌더링이 spec과 일치하는지** 결정적으로 검증하는 패턴.

## 언제 사용

- Figma MCP로 디자인 받아서 Tailwind className으로 옮긴 직후
- `applying-figma-designs` 스킬을 탄 작업
- 토큰 / 색 / 폰트 / 간격 회귀 감지가 필요할 때

라우팅 · 핸들러 · API 변경 등 시각 무관 작업엔 생략.

## 기본 패턴 — verify check 3종

| 검증 | check 타입 | 용도 |
|---|---|---|
| Tailwind 클래스가 실제 박혔는지 | `class_present` | LLM이 올바른 utility를 작성했는가 |
| 실제 픽셀로 렌더링됐는지 | `computed_style` | 클래스가 override 없이 적용됐는가 |
| 실수 변경 안 됐는지 | `class_absent` | 이전 클래스 잔존 / 잘못 적용 안 됨 |

이 셋을 task의 `verify` step 한 콜에 묶으면 됨.

## 표준 흐름

### 1) Figma MCP에서 spec 추출

```
Card:
  background: #D6EAFA
  padding: 16px
  border-radius: 12px
  font-weight: 500
```

### 2) Tailwind로 구현

```tsx
<div data-slot="card" className="bg-[#d6eafa] p-4 rounded-xl font-medium">
```

### 3) Verify check 작성

```json
{
  "checks": [
    { "type": "class_present", "selector": "[data-slot=card]", "className": "bg-[#d6eafa]" },
    { "type": "class_present", "selector": "[data-slot=card]", "className": "p-4" },
    { "type": "class_present", "selector": "[data-slot=card]", "className": "rounded-xl" },
    { "type": "class_present", "selector": "[data-slot=card]", "className": "font-medium" },
    { "type": "computed_style", "selector": "[data-slot=card]", "prop": "backgroundColor", "expected": "rgb(214, 234, 250)" },
    { "type": "computed_style", "selector": "[data-slot=card]", "prop": "padding", "expected": "16px" },
    { "type": "computed_style", "selector": "[data-slot=card]", "prop": "borderRadius", "expected": "12px" },
    { "type": "computed_style", "selector": "[data-slot=card]", "prop": "fontWeight", "expected": "500" }
  ]
}
```

`browser_verify` 한 콜로 8개 spec 동시 검증.

## ⚠️ 브라우저 정규화 (expected 작성 시 주의)

CSS 값은 브라우저가 정규화해서 computed로 출력함. **Figma 원본을 그대로 expected에 쓰면 안 됨.**

| Figma / CSS 원본 | computed (expected에 박을 값) |
|---|---|
| `#D6EAFA` | `rgb(214, 234, 250)` |
| `#ffffff` | `rgb(255, 255, 255)` |
| `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.5)` (그대로) |
| `red` | `rgb(255, 0, 0)` |
| `1rem` | `16px` |
| `0.5rem` | `8px` |
| `medium` / `bold` | `500` / `700` |
| `Inter, sans-serif` | `Inter, sans-serif` (그대로 — 따옴표 빠질 수 있음) |
| `12px` (border-radius) | `12px` |

### Hex → RGB 변환

`#RRGGBB`를 `rgb(R, G, B)`로 변환 (10진).
- `#d6eafa` → R=214, G=234, B=250 → `"rgb(214, 234, 250)"`
- `#ffffff` → `"rgb(255, 255, 255)"`

LLM은 이 변환을 자동으로 할 수 있음. 헷갈리면 **"처음 토큰 캡처" 단계** 거치면 됨.

## 🎯 Tailwind v4 + OKLCH 함정

Tailwind v4부터 **theme 컬러는 OKLCH로 출력**됨:

| Tailwind 클래스 | computed (v4) |
|---|---|
| `bg-blue-100` | `oklch(0.932 0.032 255.585)` (oklch, rgb 아님) |
| `bg-[#d6eafa]` (arbitrary) | `rgb(214, 234, 250)` (rgb 그대로) |
| `text-primary` (커스텀 토큰) | 토큰 정의에 따라 다름 |

→ Figma 컬러를 `bg-[#hex]`로 박으면 rgb로 매칭됨 (안전한 길). **theme 토큰(`bg-blue-100`)을 검증할 땐 OKLCH 값을 알아야 하는데 사람이 외울 수 없음** → 처음 토큰 캡처 패턴 필수.

## 처음 토큰 캡처 패턴 (theme color 검증용)

토큰 기반 컬러(`bg-blue-100`, `text-primary` 등) 검증 시 첫 호출에서 컴퓨티드 값을 한 번 찍어서 expected에 박음:

### Step 1: `browser_eval`로 컴퓨티드 캡처

```js
(() => {
  const el = document.querySelector("[data-slot=card]");
  const cs = getComputedStyle(el);
  return {
    backgroundColor: cs.backgroundColor,
    color: cs.color,
    borderColor: cs.borderColor,
  };
})()
```

결과 예:
```json
{
  "backgroundColor": "oklch(0.932 0.032 255.585)",
  "color": "oklch(0.205 0 0)",
  "borderColor": "oklch(0.922 0 0)"
}
```

### Step 2: 이 값을 verify check의 expected로 박음

```json
{
  "type": "computed_style",
  "selector": "[data-slot=card]",
  "prop": "backgroundColor",
  "expected": "oklch(0.932 0.032 255.585)"
}
```

### Step 3: 이후 회귀

토큰 정의 (`tokens.css`, Tailwind config)가 바뀌면 OKLCH 값도 바뀌어서 check가 fail → 회귀 감지.

## Task로 굳히는 흐름

처음 보는 컴포넌트면 lazy task 작성 패턴 (`SKILL.md` 참고):

```
1. 너: "Card 컴포넌트 디자인 적용 확인해줘"
2. LLM:
   a. browser_eval로 컴퓨티드 캡처
   b. .browser-verifier/tasks.json에 verifyCardDesign task 추가:
      - goto, wait_selector, verify(class_present + computed_style ...)
   c. browser_load_tasks → browser_run_task
3. 결과 보고 + "📝 새 task verifyCardDesign 추가됨 — review 후 commit 권장"
4. 너: git diff → review → commit
```

이후엔 디자인 회귀 의심 시 `browser_run_task({ name: "verifyCardDesign" })` 한 콜.

## 잘 잡힘 / 못 잡힘

✅ 결정적으로 잡힘:
- 잘못된 Tailwind 클래스 (오타, scale 실수: `p-4` ↔ `p-5`)
- 토큰 override (선택자 우선순위 / 인라인 스타일에 의한 무시)
- font-weight / font-family / font-size 실수
- spacing / border-radius / border-width 정확값
- 색 (arbitrary value 안전, theme 토큰은 캡처 후)
- display 모드 (flex/grid/block) 의도된 값

❌ 못 잡음 (visual diff 도구 영역):
- "디자인의 느낌" — letter-spacing / line-height 미세 튜닝
- 폰트 렌더링 차이 (Mac vs Windows)
- 1-2px sub-pixel shift
- hover / focus 상태 매칭 (state simulation 별도)
- 다크모드 자동 매칭
- 이미지 / 아이콘 시각 품질
- 텍스트 overflow 자동 줄바꿈 시안 비교

## 자주 쓰는 prop 레퍼런스

| Figma 항목 | check prop (camelCase) |
|---|---|
| Fill / background | `backgroundColor` |
| Text color | `color` |
| Stroke / border | `borderColor`, `borderWidth`, `borderStyle` |
| Border radius | `borderRadius` (shorthand) 또는 `borderTopLeftRadius` 등 |
| Padding | `padding` (shorthand) 또는 `paddingTop` / `paddingLeft` 등 |
| Margin | `margin` / `marginTop` / ... |
| Gap | `gap`, `rowGap`, `columnGap` |
| Width / Height | `width`, `height` |
| Font family / weight / size | `fontFamily`, `fontWeight`, `fontSize` |
| Line height | `lineHeight` |
| Letter spacing | `letterSpacing` |
| Display | `display` |
| Flex direction | `flexDirection` |
| Align / Justify | `alignItems`, `justifyContent` |
| Opacity | `opacity` |
| Box shadow | `boxShadow` |

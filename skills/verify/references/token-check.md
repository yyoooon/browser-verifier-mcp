# Token Application Check

디자인 토큰 매핑이 실제 DOM에 박혔는지 **구조적 매칭으로** 확인. 시각 비교 X.

## 언제 사용

- Figma 적용 / 새 토큰 도입 / 토큰 스왑 변경 후
- `applying-figma-designs` 스킬을 탄 작업

라우팅 · 문자열 수정 등 토큰 무관 변경엔 생략.

Figma → Tailwind 변환 흐름 전체는 → `figma-tailwind-check.md`.

## 우선순위

### 1차: `browser_verify` 의 `class_present` / `computed_style` (권장)

토큰 적용 검증은 verify check 한 콜로 끝남. `eval`보다 결정적이고 실패 메시지가 구조화됨.

```json
{
  "checks": [
    { "type": "class_present", "selector": "[data-slot=card]", "className": "bg-blue-weak" },
    { "type": "computed_style", "selector": "[data-slot=card]", "prop": "backgroundColor", "expected": "rgb(214, 234, 250)" }
  ]
}
```

→ expected는 **브라우저 정규화 형식** (자세히는 `figma-tailwind-check.md`의 "브라우저 정규화" 표 참고).

### 2차: `browser_inspect` — 컴퓨티드 캡처 (1차 도입 / expected 미정)

처음 토큰 도입 시 컴퓨티드 값을 한 콜에 일괄 관찰. 캡처 후 verify로 굳힘.

```json
{
  "targets": {
    "card": {
      "selector": "[data-slot=card]",
      "style": ["backgroundColor", "color", "borderRadius"],
      "classList": true
    }
  }
}
```

응답:
```json
{
  "values": {
    "card": {
      "backgroundColor": "rgb(214, 234, 250)",
      "color": "rgb(17, 24, 39)",
      "borderRadius": "12px",
      "classList": ["bg-blue-weak", "p-4", "rounded-xl"]
    }
  }
}
```

이 값을 task의 `verify` step에 expected로 박은 뒤 이후엔 1차 방식으로 회귀 감지.

### 3차: `browser_eval` (raw)

verify / inspect로 표현 불가능한 동적 케이스만:

- DOM이 querySelector로 못 잡히는 구조 (shadow DOM 등)
- 토큰 외 동작 (DOM mutation observer, ResizeObserver 결과 등)

## 금지

- **px/gap/padding "근사" 비교** — 0.5~2px 오차로 판정 불안정 (정확 일치만 OK)
- **폰트 메트릭 측정** — 본 스킬 영역 밖
- **색 hex 미세 비교** (#DC2626 vs #DC2727) — Visual Diff 도구 별도

## 1콜에 묶기

여러 토큰 / 여러 element 검증을 한 콜에:

```json
{
  "checks": [
    { "type": "class_present", "selector": "[data-slot=card-header]", "className": "bg-blue-weak" },
    { "type": "class_present", "selector": "[data-slot=card-body]", "className": "p-4" },
    { "type": "computed_style", "selector": "[data-slot=card-header]", "prop": "backgroundColor", "expected": "rgb(214, 234, 250)" },
    { "type": "computed_style", "selector": "[data-slot=card-body]", "prop": "padding", "expected": "16px" },
    { "type": "computed_style", "selector": "[data-slot=card-body]", "prop": "borderRadius", "expected": "12px" }
  ]
}
```

`browser_verify`가 selectors를 한 batch에서 query하므로 element가 많아도 1 roundtrip.

## Tailwind v4 OKLCH 함정

Tailwind v4 theme 컬러는 OKLCH로 출력. arbitrary value(`bg-[#hex]`)는 rgb 유지. 자세히는 `figma-tailwind-check.md`.

요지: **arbitrary value 위주로 박는 워크플로면 RGB로 안전.** Theme 토큰을 검증할 땐 한 번 캡처해서 OKLCH 값을 expected로 박음.

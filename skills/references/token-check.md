# Token Application Check

디자인 토큰 매핑이 실제 DOM에 박혔는지 **구조적 매칭으로** 확인. 시각 비교 X.

## 언제 사용

- Figma 적용 / 새 토큰 도입 / 토큰 스왑 변경 후
- `applying-figma-designs` 스킬을 탄 작업

라우팅·문자열 수정 등 토큰 무관 변경엔 생략.

## 방법 (우선순위)

### 1차: `classList` (가장 안전)

Tailwind 클래스가 직접 박혀있을 때:

```js
const el = document.querySelector("[data-slot=card]");
return el.classList.contains("bg-blue-weak");
```

### 2차: `getComputedStyle` (rgba 비교)

classList 검사가 불가능할 때만 (동적 조합 / 인라인 스타일 / CSS 변수):

```js
const el = document.querySelector("[data-slot=card]");
return getComputedStyle(el).backgroundColor; // "rgb(214, 234, 250)"
```

Figma 스펙의 색상값(rgba)과 비교. applying-figma-designs 작업 후라면 Figma MCP에서 확인한 색상값을 기대값으로 사용.

### 인라인 스타일 케이스

`style={{ background: 'var(--x)' }}` 같은 경우 classList 체크 불가:
- `getComputedStyle(el).background`로 computed 값 추출
- 기대값은 Figma 스펙 rgba

## 금지

- **px/gap/padding 수치 비교** — 0.5~2px 오차로 판정 불안정
- **폰트 메트릭 측정** — 본 스킬 영역 밖
- **색 hex 미세 비교** (#DC2626 vs #DC2727) — Visual Diff 도구 별도 사용

## 1콜에 묶기

cat 1-b를 다른 cat과 같이 켤 때는 `browser_eval` 하나의 IIFE에 모두 묶음:

```js
(() => {
  const card = document.querySelector("[data-slot=card]");
  return {
    // cat 1-b
    tokenCheck: {
      hasClass: card.classList.contains("bg-blue-weak"),
      bg: getComputedStyle(card).backgroundColor,
    },
    // cat 2/3 결과
    other: { /* ... */ },
  };
})()
```

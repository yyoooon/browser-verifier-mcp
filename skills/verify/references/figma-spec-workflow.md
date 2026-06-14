# Figma Spec Workflow

`figma_spec` check 한 개로 **Figma의 토큰 값이 코드에 그대로 들어가 있고, 브라우저에 실제로 똑같이 렌더링됐는지** 한 번에 검증한다. 컴포넌트뿐 아니라 페이지 레이아웃·이미 존재하는 컴포넌트 조립에도 동일 패턴.

## 0) 표준 prop 카테고리 (spec.style/typography에 무엇을 박을지)

Figma 디자인의 모든 속성을 박지 않는다 — spec이 비대해지고 false-fail이 늘어남. **토큰 변경에 민감한 핵심 prop만** 박는 게 운영 표준.

| 카테고리 | 항상 박음 (디폴트) | 컴포넌트 특성에 따라 추가 |
|---|---|---|
| 색 | `backgroundColor`, `color`, `borderColor` (또는 면별 `borderTopColor` 등) | — |
| 테두리 | `borderRadius`, `borderWidth` (또는 면별 `borderTopWidth` 등) | `borderStyle` (점선/실선 변형이 있을 때) |
| 타이포 | `fontSize`, `fontWeight`, `lineHeight` | `letterSpacing`, `fontFamily` (특수 폰트 쓰는 컴포넌트만) |
| 간격 | `paddingTop`, `paddingLeft`, `columnGap` | `paddingRight`/`paddingBottom` (비대칭), `rowGap`, `margin` |
| 사이즈 | — | `width`, `height` (디자인에 명시된 경우만 — 버튼/인풋의 `h-10`, 아이콘 사이즈, 모달 너비 등) |
| 효과 | — | `boxShadow`, `opacity` (디자인에 명시된 컴포넌트만) |
| 레이아웃 | — | `display`, `flexDirection`, `overflowX` (레이아웃 컨테이너만) |

### 왜 padding/border는 한 면만?
대부분의 컴포넌트는 대칭 패딩/테두리라 한 면만 박아도 충분. 비대칭 디자인이면 그때만 네 면 모두 박는다.

### fontFamily 운영 규칙
- 사이트가 한 폰트 가족(`Inter`, `Pretendard` 등)만 쓴다면 **컴포넌트별 spec엔 박지 않는다**.
- 대신 `.figma-specs/_global.figma-spec.json` 같은 **사이트 단위 spec** 한 개를 만들어서 `body { fontFamily: ... }`를 1회만 검증한다.
- 컴포넌트가 특수 폰트(예: 본문은 Inter, 코드 영역만 monospace)를 쓰는 경우에만 그 컴포넌트 spec에 박는다.

### 검증 안 하는 것 (MCP가 자동으로 무시)
spec.style에 박아도 MCP가 silently drop:

| prop | 이유 |
|---|---|
| `transition-*`, `animation-*` | 측정 직전 모든 transition을 `0s !important`로 강제 (`installTransitionGuard`). 검증 대상 아님. |
| `cursor` | 마우스 포인터, 시각 영향 미미. |
| `boxSizing` | 구조 영향만, 시각 차이 없음. |

→ Figma에서 추출돼도 spec에 박을 필요 없음. 박으면 그냥 무시.

## 자동 spec 커버리지 검사 (강제 가드)

위 표만으론 LLM이 spec 작성 시 카테고리를 빼먹을 수 있음. MCP가 자동으로 검사해서 누락 시 결과에 알림:

### 기본 동작 (warn)
spec.targets 안의 `style` / `typography`에 박힌 prop들을 카테고리별로 자동 분류 → **필수 카테고리(`color` / `border` / `typography` / `spacing`) 중 하나라도 prop이 없으면 `[spec-coverage]` 메시지로 경고** (검증은 통과).

```
[spec-coverage] warning: missing required category "border" — no prop from
[borderRadius, borderTopLeftRadius, ...]. Add a prop or list in
spec.skipCategories to silence.
```

LLM이 결과를 보고 빠뜨린 카테고리를 인지 → spec 보완.

### strict 모드 (fail)
CI 강제용:

```json
{
  "strict": true,
  "targets": [...]
}
```

→ 누락 카테고리는 fail. PR이 막힘.

### 의도적으로 한 카테고리를 빼는 경우
텍스트만 검증하는 spec 등 일부 카테고리가 무의미할 때:

```json
{
  "skipCategories": ["spacing", "border"],
  "targets": [...]
}
```

→ 해당 카테고리는 누락 경고 안 띄움.

### 카테고리 → prop 매핑 (MCP 내부)
| 카테고리 | 포함되는 prop들 |
|---|---|
| `color` | backgroundColor, color, borderColor, border\[Top\|Right\|Bottom\|Left\]Color, outlineColor |
| `border` | borderRadius, border\[Top\|Right\|Bottom\|Left\]\[Width\|...Radius\], borderWidth |
| `typography` | fontSize, fontWeight, lineHeight |
| `spacing` | padding, padding\[Top\|Right\|Bottom\|Left\], gap, rowGap, columnGap |

위 카테고리에 속한 prop이 spec에 **한 개라도** 있으면 그 카테고리는 "박혔다"로 간주. (4면 다 박지 않아도 됨)



## 1) 메인 세션이 Figma MCP로 spec 추출

브라우저-베리파이어 MCP는 다른 MCP를 직접 호출하지 않는다. Figma MCP는 **사용처 프로젝트의 `.mcp.json`** 에 등록한다. 메인 세션(Claude Code)이 Figma MCP로 토큰/메타데이터를 받아 표준 JSON으로 저장하면, 이 MCP는 그 파일만 본다.

표준 위치 권장: `<repo>/.figma-specs/<name>.figma-spec.json`

```json
{
  "name": "NoticeManagementHeader",
  "figmaUrl": "https://www.figma.com/file/...",
  "targets": [
    {
      "selector": "[data-slot=notice-title]",
      "state": "rest",
      "typography": {
        "fontSize": "24px",
        "fontWeight": "700",
        "lineHeight": "32px",
        "letterSpacing": "-0.4px"
      },
      "style": { "color": "#141414" }
    },
    {
      "selector": "button[data-slot=cta]",
      "state": "hover",
      "style": { "backgroundColor": "#0050C8" }
    },
    {
      "selector": "button[data-slot=cta]",
      "state": "active",
      "style": { "backgroundColor": "#003D9E" }
    },
    {
      "selector": "input[name=email]",
      "state": "focus",
      "style": { "borderColor": "#0066FF" }
    }
  ]
}
```

### selector 정하기
- 가능하면 `data-slot` / `data-testid` 등 안정적 속성 사용
- 클래스 기반은 Tailwind v4 / arbitrary 값 충돌 가능성 있으니 지양
- 같은 element를 다른 state로 여러 번 검증할 거면 같은 selector를 여러 target에 반복 명시

### state별 의미
| state | 동작 |
|---|---|
| `rest` (기본) | 아무 인터랙션 없이 측정 |
| `hover` | `page.hover(selector)` 후 측정 |
| `focus` | `page.focus(selector)` 후 측정 |
| `active` | hover + `mouse.down()` 유지 상태로 측정 (실제 `:active` 발동) |

각 target 측정 후 자동으로 reset (마우스 복귀 / blur / mouseup).

### 토큰 검증 옵션 (선택, 시각 검증과 별개)

#### `target.tokens` — 토큰 **사용** 검증
className 배열을 넣으면 element.classList에 토큰이 박혀있는지 확인. 컴파일된 색이 맞아도 raw hex (`bg-[#18181b]`)로 박은 케이스를 잡아냄.

```json
{
  "selector": "[data-testid=cta]",
  "tokens": ["bg-primary", "text-primary-foreground"],
  "style": { "backgroundColor": "#18181b" }
}
```

→ 결과 메시지 prefix: `[token-usage]`. computed 결과는 맞는데 토큰 className이 없으면 fail.

#### `spec.cssVariables` — 토큰 **선언** 검증
`getComputedStyle(:root).getPropertyValue('--xxx')`가 빈 문자열이면 사용처 theme에 미선언 → fail. Figma에는 있는데 프로젝트에 없는 토큰 감지용.

```json
{
  "cssVariables": ["--primary", "--input", "--muted-foreground"],
  "targets": [...]
}
```

→ 결과 메시지 prefix: `[token-declared]`. 변수명은 `--`로 시작하거나 생략 가능 (자동 `--` 붙임).

### 토큰 미선언 감지 시 행동 규약 (LLM)

`figma_spec` 결과에 `[token-declared]` fail이 섞여 오면 **LLM은 즉시 사용자에게 어떻게 처리할지 물어야 한다** — 자동 결정 금지. 보통 4가지 선택지:

1. **사용처 theme에 토큰 추가** (Figma 값으로 `--xxx` 정의) — 디자인 시스템 정합성 최우선
2. **arbitrary 값 유지** (`bg-[#xxx]` 그대로) — 일회성 컴포넌트, 향후 디자인 변경 가능성 낮음
3. **기존 다른 토큰으로 매핑** (`bg-primary` 사용, 색은 거의 같음) — 시각적 차이 허용
4. **무시 / spec에서 제거** — 검증 대상에서 제외

`[token-usage]` fail은 spec이 토큰 사용을 강제하는 거니까, 컴포넌트를 토큰 사용 형태로 고치거나 spec.target.tokens에서 빼는 선택.

## 2) MCP가 받아서 검증

`browser_verify`에 `figma_spec` check 한 줄만 박으면 끝:

```json
{
  "checks": [
    { "type": "loaded" },
    { "type": "no_errors" },
    { "type": "figma_spec", "spec": ".figma-specs/notice-header.figma-spec.json" }
  ]
}
```

또는 spec 객체를 그대로 인라인으로 던져도 됨 (작은 검증에 편함):

```json
{
  "checks": [
    {
      "type": "figma_spec",
      "spec": {
        "targets": [
          {
            "selector": "h1",
            "style": { "color": "#141414", "fontSize": "24px" }
          }
        ]
      }
    }
  ]
}
```

### 동작·스타일 한 콜에 묶기
LLM이 항상 같은 한 콜에 박도록 한다:
1. `loaded` — 페이지 로드 완료
2. `no_errors` — 비주얼 에러 없음
3. `figma_spec` — 토큰 일치 (스타일)

→ MCP가 결과를 펼쳐 한 응답으로 반환.

## 3) 자동 정규화 / transition 차단

검증 직전 MCP가 자동으로 처리하니 사용자가 신경쓸 필요 없음:

| 입력 (Figma 그대로) | 비교 대상 (브라우저 normalized) |
|---|---|
| `#D6EAFA` | `rgb(214, 234, 250)` |
| `#FFFFFF` | `rgb(255, 255, 255)` |
| `#00000080` (alpha) | `rgba(0, 0, 0, 0.5)` |
| 그 외 (px, rgb(), oklch() 등) | 그대로 전달 |

비교는 **정확 일치** (px 오차 허용 X). 1px 차이도 fail. 그래서 spec에는 실제 컴파일 결과를 박아야 한다.

### transition 차단
hover/focus/active 측정 직전에 `<style>` 인젝트로 모든 transition/animation을 0초로 만든다 → 중간색 측정 방지. 검증 끝나면 자동 제거.

## 4) Tailwind v4 + OKLCH 함정

theme 토큰(`bg-blue-100`)은 `oklch(...)`로 컴파일됨. Figma의 hex/rgb로는 검증 불가. 두 가지 해결:

**A. 컴포넌트가 arbitrary 값(`bg-[#hex]`)을 쓰는 경우** — spec에 hex 그대로 박으면 됨 (rgb 자동 변환).

**B. 컴포넌트가 theme 토큰을 쓰는 경우** — `browser_inspect`로 한 번 컴퓨티드 캡처:

```json
{ "targets": { "card": { "selector": "[data-slot=card]", "style": ["backgroundColor"] } } }
```

결과의 `oklch(...)` 값을 spec의 expected에 박는다 (Figma 원본 색이 아닌, **현재 토큰이 컴파일된 결과**를 박음 — 토큰 정의 회귀가 spec 검증에서 잡힘).

## 5) 잘 잡는 / 못 잡는

✅ 결정적으로 잡힘
- 잘못된 토큰 (오타, scale 실수)
- 토큰 override / 상속 깨짐
- 타이포 4속성 (fontSize / fontWeight / lineHeight / letterSpacing)
- 색 / 보더 / 라운드 / 패딩 / 간격
- hover · focus · active의 실제 컴파일된 값

❌ 못 잡음 (visual diff 도구 영역)
- 1-2px sub-pixel shift (정확 비교라 fail로 잡히지만 원인 파악은 사람 몫)
- 폰트 렌더링 OS 차이
- 이미지 / 아이콘 시각 품질
- 다크모드 자동 매칭 (각 모드 spec 별도 작성 필요)

## 6) 권장 사용 흐름

```
[사용자] Figma 컴포넌트 링크 + "구현 후 검증해줘"
   ↓
[메인 세션] Figma MCP로 토큰 추출 → .figma-specs/<name>.figma-spec.json 저장
[메인 세션] 코드 구현
[메인 세션] browser_verify({ checks: [loaded, no_errors, figma_spec(<path>)] })
   ↓
[MCP] 한 응답으로 동작+스타일 검증 결과 펼쳐서 반환
   ↓
실패한 sub-result의 message에 [state] selector prop: expected → got 형태로 어긋난 지점 명시
```

# Figma Spec Workflow

`figma_spec` check 한 개로 **Figma의 토큰 값이 코드에 그대로 들어가 있고, 브라우저에 실제로 똑같이 렌더링됐는지** 한 번에 검증한다. 컴포넌트뿐 아니라 페이지 레이아웃·이미 존재하는 컴포넌트 조립에도 동일 패턴.

## 0) 원칙 — Figma의 시각 속성을 **전부** 뽑는다 (누락 = 실패)

> ⚠️ 예전 이 문서는 "핵심 prop만 박아라"였다. 그게 스타일 누락의 근원이었다. **뒤집는다: 시각에 영향 주는 속성은 전부 박는다.**

**"이 속성은 안 바뀌니 생략" 금지.** 안 바뀌어도 값을 명시한다 (예: `boxShadow: "none"`, `borderTopWidth: "0px"`, `opacity: "1"`). 빠뜨린 속성은 검증에서 통째로 빠져 **"초록불인데 실제론 안 본 것"** 이 된다.

대상 = `VISUAL_PROPERTY_SET` (`src/runtime/verify/figma/visual-properties.ts`, ~43개 longhand):

| 그룹 | 속성 |
|---|---|
| color | `color`, `backgroundColor`, `border[Top\|Right\|Bottom\|Left]Color`, `outlineColor` |
| border | `border[Top\|Right\|Bottom\|Left]Width`, `…Style`, `border[TopLeft\|TopRight\|BottomRight\|BottomLeft]Radius`, `outlineWidth`, `outlineStyle`, `outlineOffset` |
| typography | `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `letterSpacing`, `textDecorationLine`, `textAlign` |
| spacing | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `columnGap`, `rowGap` |
| effect | `boxShadow`, `opacity` |
| layout | `height`, `minHeight`, `display`, `alignItems`, `justifyContent` |

- `target.typography`에는 5개(`fontSize`/`fontWeight`/`lineHeight`/`letterSpacing`/`fontFamily`), **나머지 전부(`fontStyle`·`textDecorationLine`·`textAlign` 포함)는 `target.style`** 에 박는다. 둘 다 완전성 검사 대상.
- longhand만 쓴다 — shorthand(`border`, `padding`)는 브라우저마다 직렬화가 달라 비교가 불안정.

### 검증 안 하는 것 (박아도 MCP가 무시)
`transition-*`, `animation-*`, `cursor`, `boxSizing` → measure 직전 transition guard로 0s 강제거나 비시각. VISUAL_PROPERTY_SET에 없으니 애초에 안 뽑아도 됨.

### 의도적으로 한 그룹을 뺄 때
텍스트만 검증하는 spec 등 특정 그룹이 무의미하면 `spec.skipCategories`로 그룹째 면제 → 그 그룹 속성은 완전성 검사에서 빠진다.
```json
{ "skipCategories": ["spacing", "layout", "effect"], "targets": [...] }
```
그룹: `color` / `border` / `typography` / `spacing` / `effect` / `layout`.

## 1) Figma → spec 추출 (메인 세션 · Figma MCP · extractor)

browser-verifier MCP는 다른 MCP를 직접 호출하지 않는다. **메인 세션(Claude Code)** 이 Figma MCP로 값을 뽑아 표준 JSON으로 저장하면, 이 MCP는 그 파일만 본다. Figma MCP는 사용처 프로젝트 `.mcp.json`에 등록.

### 절대 규칙: 구현 코드를 보지 마라
값은 항상 **Figma에서** 가져온다. 렌더된 화면·기존 컴포넌트 코드를 "기준선"으로 캡처하지 마라 — **"구현이 구현과 일치"는 버그를 영속화**하는 순환 오류다. Figma가 유일한 진실 출처.

### 추출 절차
1. **노드별 데이터 수집** (단일 node-id 단위로만, 전체 페이지 호출 금지):
   - `get_variable_defs` — 바인딩된 변수 전체 (색 hex, radius/spacing rem 등).
   - `get_metadata` — variant 이름·구조.
   - `get_design_context` — 레이아웃·타이포·보더·효과 상세.
2. **값 변환** (Figma → computed 형식). hex/rem은 MCP가 자동 정규화하니 Figma 그대로 박아도 되지만, 나머지는 아래 형식으로:

   | Figma | spec 값 |
   |---|---|
   | hex `#4830F2` | `#4830F2` (또는 `rgb(72, 48, 242)`) — MCP가 rgb로 변환 |
   | hex+opacity `#000000 30%` | `rgba(0, 0, 0, 0.3)` |
   | rem `1rem` | `16px` |
   | 없음 / none | `"none"` (boxShadow/outlineStyle 등) / width는 `"0px"` |
   | `medium` / `semibold` | `"500"` / `"600"` |
   | opacity 100% / 0% | `"1"` / `"0"` |

   - `outlineColor` CSS 기본은 `currentColor` → **state별 `color` 값과 같게** 다시 계산.
3. **모든 `VISUAL_PROPERTY_SET` 키를 채운다** — 안 바뀌는 것도 명시.
4. **토큰 바인딩 기록** — Figma 변수에 바인딩된 속성은 `tokens: [{ "class", "prop" }]`로 기록(raw 값·바인딩 없는 건 제외). 색 토큰이면 swatch 검증(§4-B)까지 걸림.
5. **완전성 자가검사 (저장 전 필수).** 각 target이 `VISUAL_PROPERTY_SET`(skipCategories 제외)를 **전부** 채웠는지 확인. 하나라도 빠지면 **저장하지 말고 누락 목록과 함께 보고**. "안 바뀌니 생략" 다시 금지.
6. **`strict: true` 세팅** 후 `<repo>/.figma-specs/<name>.figma-spec.json` 저장. → 이후 MCP가 `[spec-completeness]`로 강제(누락 시 fail).

### 스펙 예시 (state별 = 같은 selector 반복)
```json
{
  "name": "CtaButton",
  "figmaUrl": "https://www.figma.com/design/...",
  "strict": true,
  "targets": [
    {
      "selector": "button[data-slot=cta]",
      "state": "rest",
      "typography": { "fontSize": "16px", "fontWeight": "600", "lineHeight": "24px", "letterSpacing": "0px", "fontFamily": "Pretendard" },
      "style": {
        "color": "rgb(255,255,255)", "backgroundColor": "#4830F2",
        "borderTopColor": "rgba(0,0,0,0)", "borderRightColor": "rgba(0,0,0,0)", "borderBottomColor": "rgba(0,0,0,0)", "borderLeftColor": "rgba(0,0,0,0)",
        "borderTopWidth": "0px", "borderRightWidth": "0px", "borderBottomWidth": "0px", "borderLeftWidth": "0px",
        "borderTopStyle": "none", "borderRightStyle": "none", "borderBottomStyle": "none", "borderLeftStyle": "none",
        "borderTopLeftRadius": "14px", "borderTopRightRadius": "14px", "borderBottomRightRadius": "14px", "borderBottomLeftRadius": "14px",
        "boxShadow": "none", "opacity": "1",
        "outlineColor": "rgb(255,255,255)", "outlineWidth": "0px", "outlineStyle": "none", "outlineOffset": "0px",
        "fontStyle": "normal", "textDecorationLine": "none", "textAlign": "center",
        "paddingTop": "12px", "paddingRight": "16px", "paddingBottom": "12px", "paddingLeft": "16px",
        "columnGap": "6px", "rowGap": "6px", "height": "48px", "minHeight": "0px",
        "display": "inline-flex", "alignItems": "center", "justifyContent": "center"
      },
      "tokens": [
        { "class": "bg-button-primary", "prop": "backgroundColor" },
        "rounded-14"
      ]
    }
  ]
}
```

### selector 정하기
- `data-slot` / `data-testid` 등 **안정적 속성** 사용. 클래스 기반은 Tailwind v4 arbitrary 충돌 위험이라 지양.
- 같은 element를 여러 state로 검증하려면 **같은 selector를 여러 target에 반복** 명시.

### state별 의미
| state | 동작 |
|---|---|
| `rest` (기본) | 인터랙션 없이 측정 |
| `hover` | `page.hover(selector)` 후 |
| `focus` | `page.focus(selector)` 후 |
| `active` | hover + `mouse.down()` 유지 (`:active` 발동) |

각 target 측정 후 자동 reset(마우스 복귀 / blur / mouseup).

## 2) 완전성 검사 (누락 = 실패 엔진)

MCP가 자동으로 검사한다. `coverage.ts` 기준:

### strict 모드 (`spec.strict: true`) — extractor 스펙의 기본
각 target이 `VISUAL_PROPERTY_SET`(skipCategories 제외)를 전부 채웠는지 검사. **하나라도 빠지면 `[spec-completeness]` FAIL**, 누락 속성을 목록으로 알려준다:
```
[spec-completeness] "button[data-slot=cta]" — 2 visual prop(s) unspecced:
[boxShadow, letterSpacing]. Extract them from Figma (list even unchanged
ones, e.g. boxShadow:"none") or silence a whole group via spec.skipCategories.
```
→ **Figma 값을 빼먹고 구현하면 통과가 아니라 실패.** 이게 이 워크플로의 핵심 가드.

### 기본 모드 (non-strict) — 완화된 경고
`strict` 없으면 spec 전체 기준으로 nudge 카테고리(`color`/`border`/`typography`/`spacing`) 중 통째로 빠진 게 있으면 **`[spec-coverage]` 경고**(검증은 통과). extractor로 만든 스펙은 항상 `strict: true`를 켜라 — 그래야 완전성이 강제된다.

### 토큰이 prop을 커버하는 규칙
`tokens`의 객체 항목 `{ class, prop }`은 그 `prop`을 **swatch 검증으로 커버**한 것으로 쳐서 완전성 검사에서 빠지지 않는다. 문자열 토큰(`"rounded-14"`)은 classList 존재만 보므로 prop 커버로 치지 않는다.

## 3) 토큰 검증 옵션 (시각 검증과 별개)

#### `target.tokens` 문자열 — 토큰 **사용** 검증
className이 element.classList에 있는지. 컴파일 색이 맞아도 raw hex(`bg-[#18181b]`)로 박은 걸 잡음. 메시지 prefix `[token-usage]`.

#### `target.tokens` 객체 `{class, prop}` — 토큰 **연결** 검증 (레퍼런스 스와치, 팔레트 불변)
같은 부모에 임시 스와치를 만들어 토큰 클래스만 입히고, 스와치 computed와 실제 요소 computed를 비교. rgb를 spec에 굽지 않아 **팔레트가 바뀌어도 spec 수정 불필요**. 메시지 prefix `[token-swatch]`.
- 토큰 정리된 프로젝트에서만 의미. `hover:` 같은 pseudo-variant는 스와치에서 발동 안 됨 → 상태별 시맨틱 토큰(`bg-primary-hover`)을 쓸 것.

#### `spec.cssVariables` — 토큰 **선언** 검증
`getComputedStyle(:root).getPropertyValue('--xxx')`가 빈 문자열이면 theme 미선언 → fail. 메시지 prefix `[token-declared]`.

### 토큰/완전성 실패 시 행동 규약 (LLM)
`[token-declared]` · `[spec-completeness]` fail이 섞여 오면 **자동 결정 금지, 사용자에게 물어라**:
1. theme에 토큰 추가 (Figma 값으로 `--xxx` 정의)
2. arbitrary 값 유지
3. 기존 토큰으로 매핑
4. (완전성) 누락 속성을 Figma에서 추출해 spec에 추가
5. 무시 / 그룹을 skipCategories로 침묵

## 4) 자동 정규화 / transition 차단

검증 직전 MCP가 자동 처리:

| 입력 (Figma) | 비교 대상 (normalized) |
|---|---|
| `#D6EAFA` | `rgb(214, 234, 250)` |
| `#00000080` (alpha) | `rgba(0, 0, 0, 0.5)` |
| 그 외 (px, rgb(), oklch()) | 그대로 |

비교 규칙(0.8.0):
- **단일 px 값은 ±0.5px 허용** (zoom/DPR sub-pixel 스냅). 예전 "정확 일치"는 옛말.
- **색은 공백 무시** 비교, `fontFamily`는 따옴표/대소문자 무시 + BlinkMacSystemFont↔system-ui 통일.
- hover/focus/active 측정 직전 모든 transition/animation을 0s로 강제 → 중간색 방지. 검증 후 자동 제거.

## 5) Tailwind v4 + OKLCH 함정

theme 토큰(`bg-blue-100`)은 `oklch(...)`로 컴파일 → Figma hex로 직접 비교 불가. 해결:
- **A. arbitrary 값(`bg-[#hex]`)** — spec에 hex 그대로 (rgb 자동 변환).
- **B. theme 토큰** — 값을 굽지 말고 `tokens: [{class, prop}]` **스와치 검증**을 써라(팔레트 불변). 또는 `browser_inspect`로 현재 컴파일된 `oklch(...)`를 한 번 캡처해 expected에 박는다(토큰 정의 회귀가 잡힘).

## 6) 잘 잡는 / 못 잡는

✅ 결정적으로 잡힘
- 잘못된 토큰 / override 깨짐 / 상속 깨짐
- 타이포·색·보더·라운드·패딩·간격
- hover·focus·active의 실제 컴파일 값
- **Figma에 있는데 spec/구현에서 빠진 시각 속성 (strict 완전성)**

❌ 못 잡음 (visual diff 영역)
- 1-2px sub-pixel shift(±0.5px는 통과) / 폰트 OS 렌더 차 / 이미지·아이콘 품질 / 다크모드 자동(모드별 spec 별도)

## 7) 권장 흐름

```
[사용자] Figma 링크 + "구현 후 검증"
   ↓
[메인 세션] Figma MCP로 전 속성 추출 → 완전성 자가검사 → strict:true 스펙 저장(.figma-specs/<name>.json)
[메인 세션] 코드 구현
[메인 세션] browser_verify({ checks: [loaded, no_errors, figma_spec(<path>)] })
   ↓
[MCP] 완전성([spec-completeness]) + 값 일치 + 토큰 검증을 한 응답으로 펼침
   ↓
빠뜨린 Figma 속성·어긋난 값이 sub-result로 표면화 → 실패
```

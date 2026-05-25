# Tier Selection (Light vs Full)

검증 비용은 변경 영향도에 비례. 한 줄 변경에 풀 dispatch 금지.

## 알고리즘

`git diff --name-only HEAD` + `git diff HEAD --stat`로 평가.

### Light Path 조건 (모두 충족)

- 변경 파일이 다음 중 하나만:
  - `*.tsx` / `*.css` / `*.scss` (시각 / JSX)
  - `src/app/**/_components/**/*.ts(x)` — page-scoped 컴포넌트
  - `src/app/**/_lib/**/*.ts` — page-scoped 유틸 (정책 함수, 변환, 색상 매핑)
  - `src/app/**/_mock/**/*.ts` — mock 데이터
  - `src/app/**/_store/**/*.ts` — page-scoped store
- `src/lib/` `src/service/` `src/app/api/` 변경 **없음** — 전역 service layer는 항상 Full
- `src/middleware.ts` 변경 **없음** — 1줄만 바뀌어도 무조건 Full
- `route.ts` 변경 **없음**
- 새 `page.tsx` 추가 **없음** (단, untracked가 `_components/_lib/` 안이면 Light OK)
- 누적 추가 라인 < 80

### Full Path 진입 조건 (하나라도)

- 라우팅 / middleware / auth 파일 변경
- 전역 service / api / queries / mutations 변경 (`src/service/`, `src/app/api/`)
- 새 `page.tsx` 또는 새 route 추가
- Zustand store / context provider 변경 (page-scoped `_store/` 제외)
- 80줄 이상 누적 변경
- Light path에서 unexpected 에러 발견 → 메인이 fix 가능 범위 초과 판단
- 사용자가 명시적으로 "꼼꼼히 검증" 요청

## Page-scoped 디렉토리가 Light인 이유

`src/app/<route>/_components/`, `_lib/`, `_mock/`, `_store/` 는 Next.js 컨벤션상 라우터가 무시하는 페이지 내부 모듈. 영향 범위가 한 페이지로 제한되므로 시각 검증과 동급.

전역 영향이 가능한 `src/lib/`, `src/service/`와 구분됨.

## 실행 비용 목표

| Path | 호출 수 | wall-clock | red flag |
|---|---|---|---|
| Light | 4-6 MCP | < 10s | > 15s |
| Full (no fix) | 서브에이전트 | < 60s | > 90s |
| Full + 1 fix loop | 서브에이전트 | < 120s | > 180s |

red flag 초과 시 PASS 보고 다음 줄에 `⚠️ baseline(Xs) 초과 — <원인>` 1줄 자동 덧붙임.

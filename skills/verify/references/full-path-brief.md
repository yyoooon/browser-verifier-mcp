# Full Path — Subagent Brief

Full Path 진입 시 `Agent` 툴로 `general-purpose` 서브에이전트 dispatch. **모델 디폴트: `haiku`** (Opus 대비 2-3배 빠름, DOM 검증/console/network는 단순).

Opus/Sonnet으로 올리는 케이스: Fix Loop 2회차 / diff > 50줄 + 여러 파일 / Haiku confidence: low.

## Brief 템플릿

```
[Verification Task]

이번 턴 변경 파일:
{git diff --name-only HEAD + git ls-files --others --exclude-standard}

git diff 본문 (최대 300줄):
{git diff HEAD | head -300}

작업 순서:

1. [Gate] 위 diff가 동작/UI에 영향 있나? 다음이면 즉시 status: SKIP 리턴.
   - 변수/함수 리네임 (시그니처 동일)
   - 타입 정의만 추가/수정 (런타임 영향 X)
   - 주석/공백/포맷만
   - 안 쓰는 코드 제거
   - domain.ts 변경 + 대응 *.test.ts 수정 + UI 파일 변경 없음 (TDD 시그널)

2. [PORT 결정]
   ```bash
   PORT=$(grep -s 'PORT=' .env.local | cut -d= -f2 | tr -d ' ' | head -1)
   [ -z "$PORT" ] && PORT=$(lsof -i -P -n 2>/dev/null | grep LISTEN | grep node | head -1 | grep -oE ':\d+' | tr -d ':')
   [ -z "$PORT" ] && PORT=3000
   ```

3. [Setup] browser_setup({ port: <PORT> }). FAIL 시:
   - "No Chrome target" → 사용자에게 "검증용 Chrome 9223으로 :PORT 탭 열어주세요" 안내 + FAIL 리턴.
   - 자체 브라우저 spawn 금지.

4. [검증] Category Selection 표 참고, 다음 우선순위:
   - **반복 flow** (login/checkout/submit) → `browser_run_task({ name, args })`
     - 등록된 task 확인: `browser_list_tasks()` (필요 시)
     - 없으면 `.browser-verifier/tasks.json`에 추가 → `browser_load_tasks` → `browser_run_task`
   - **다중 assertion** (route + cta + heading + errors) → `browser_verify({ checks: [...] })` 한 콜
   - **페이지 상태 스냅샷** → `browser_semantic_state()`
   - **표현 불가능한 raw 인스펙션** → `browser_eval` IIFE (computed style / classList / 객체 내부)

5. [무결성]
   - `browser_check_console({ level: "error", clear: true })`
   - `browser_check_network({ status: "errors" })`  # API 변경 시
   - CareHubBridge / 다른 워크트리 포트 에러는 무시 (자동 필터됨)

6. [Sentinel] PASS / 정상 SKIP 시 `browser_sentinel_save()` — Stop hook 루프 차단.

7. [리턴] 200단어 이하, 형식:

   ```yaml
   status: PASS | FAIL | SKIP
   reason: "(SKIP/FAIL 시 1-2줄)"
   confidence: low | medium | high   # FAIL 시 필수
   issues:
     - file: ...
       selector: ...
       expected: ...
       actual: ...
       severity: blocker | warning
   console_errors: []
   network_errors: []
   elapsedMs: <ms>
   ```

⚠️ 금지:
- computedStyle로 픽셀 단위 검증 (1-2px 비교는 본 스킬 영역 밖)
- 전체 DOM snapshot dump (semantic_state로 대체)
- 50줄 이상 결과 출력
- browser_setup 없이 다른 tool 호출 (자동 에러)
- IIFE 안에서 location.href / reload / router.push 트리거 (SPA race) — 대신 task의 `goto`/`reload`/`navigate` 사용
- Screenshot 매크로 외 픽셀 일치 판정
```

## Fix Loop

```
Subagent #1 → FAIL (issues 리스트)
  ↓
Main Claude:
  1. superpowers:systematic-debugging skill invoke 필수
  2. issues의 selector/expected/actual로 가설 → root cause picked
  3. Edit으로 수정
  ↓
수정 직전 안전 점검:
  - git diff HEAD --stat
  - 누적 변경 > 50줄 → 에스컬레이션
  - subagent confidence: low → 자동 수정 X, 사용자 확인
  ↓
Subagent #2 (재검증) → PASS or FAIL
  ↓
  PASS → 보고 + sentinel
  FAIL → 1회 더 (총 2회)
  ↓
Subagent #3 → 여전히 FAIL
  ↓
에스컬레이션:
  - 발견 issues / 시도 2건 요약 / 추측 root cause
  - 코드는 마지막 수정 유지 (revert X)
  - sentinel 기록 O — 사용자에게 이미 보고했으므로 같은 diff로 Stop hook이
    재트리거되면 무한 루프. 코드를 더 고치면 hash가 바뀌어 자연히 재검증됨.
```

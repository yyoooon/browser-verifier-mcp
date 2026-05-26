# Browser-verifier MCP & Chrome CDP 포트 정리

> 작성: 2026-05-26 — Chrome `--remote-debugging-port`, CDP, ephemeral 포트, 그리고 본 MCP와 공식 Playwright MCP의 차이를 정리한 문서.

---

## 1. 이 MCP는 어떻게 Chrome에 붙는가

`browser-verifier` MCP는 **Playwright Core**를 사용하지만, 동작 방식은 일반 Playwright 자동화와 결정적으로 다르다.

```ts
// src/runtime/client.ts
const CDP_PORT = 9223;
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
```

- `chromium.launch()` — 새 Chrome 띄움 (공식 Playwright MCP의 기본 모드)
- `chromium.connectOverCDP()` — **이미 떠 있는 Chrome에 CDP로 접속** ← 이 MCP가 쓰는 방식

즉 이 MCP는 자기 Chrome을 띄우지 않는다. **사용자가 9223 포트로 미리 띄워둔 개발용 Chrome**에 붙어서 작동한다.

### 9223은 어디에 박혀 있나

| 파일 | 내용 |
|---|---|
| `src/runtime/client.ts:5` | `const CDP_PORT = 9223;` |
| `src/cdp/target.ts:11` | `listTargets(cdpPort = 9223)` |
| `src/cdp/target.ts:33` | `findTargetByPort(..., cdpPort = 9223)` |

→ 환경변수로 받지 않고 **상수로 하드코딩**. 다른 포트로 바꾸려면 소스 수정 필요.

---

## 2. Chrome `--remote-debugging-port` 옵션

### 기본 동작

| Chrome 실행 방식 | CDP 포트 |
|---|---|
| 그냥 실행 (일상용) | **없음 — 디버깅 포트 비활성화** |
| `--remote-debugging-port=9223` | 9223 |
| `--remote-debugging-port=9222` | 9222 (Playwright/Puppeteer 관습적 디폴트) |
| `--remote-debugging-port=0` | OS가 랜덤 빈 포트 할당 |

**핵심**: 일상용 Chrome은 디버깅 포트가 닫혀 있다. "기본값 9222"가 아니라 "옵션 없으면 닫힘"이 보안 디폴트.

### 포트 선택 자유도

| 주체 | 포트 자유도 |
|---|---|
| Chrome 자체 | 1024 이상 빈 포트면 어떤 번호든 OK |
| Playwright 코드 | `connectOverCDP("http://127.0.0.1:포트")`로 자유 |
| **browser-verifier MCP** | **9223 고정** |

→ 이 프로젝트에서는 Chrome도 9223으로 띄워야 매칭됨.

---

## 3. 일상용 Chrome으로도 가능한가?

기술적으로 가능하지만 권장하지 않음.

### 가능한 경로

1. 평소 떠 있는 Chrome **전부 종료**
2. `--remote-debugging-port=9223` 옵션 줘서 다시 실행
3. → 일상용 프로필 그대로 (북마크/로그인/확장 유지) 디버깅 포트 열린 상태로 뜸
4. Playwright/MCP가 `connectOverCDP`로 접속 가능

### 권장하지 않는 이유

| 문제 | 설명 |
|---|---|
| 보안 | 9223 열려있는 동안 로컬의 모든 프로세스가 그 Chrome에 붙을 수 있음 → Gmail·은행·SSO 세션 노출 |
| 운영 불편 | 평소 Chrome 매번 다 끄고 옵션 줘서 재실행해야 함. Chrome은 백그라운드에 살아있어서 강제 종료 필요 |
| 오염 위험 | 자동화가 일상 세션의 쿠키/로컬스토리지/확장을 건드릴 수 있음 |

### 표준 패턴 — 별도 `user-data-dir`

```bash
"Google Chrome" \
  --remote-debugging-port=9223 \
  --user-data-dir=/Users/yoon/chrome-dev-profile
```

- 평소 Chrome과 **완전히 별개 프로세스**로 뜸 (Chrome single-instance 락은 user-data-dir 단위)
- 일상 Chrome 끄지 않고도 디버깅 Chrome 병행 가능
- 보안 노출 면적이 dev 환경에만 한정됨

---

## 4. 포트 개념 — LISTEN vs ephemeral

### 모든 프로그램이 포트를 점유하지는 않는다

| 역할 | 포트 사용 방식 | 예시 |
|---|---|---|
| **서버 (LISTEN)** | 특정 포트를 잡고 들어오는 연결 대기 | 웹서버, DB, 디버깅 모드 Chrome |
| **클라이언트** | 통신할 때만 OS가 임시 포트(ephemeral) 빌려줌, 끝나면 반납 | 사이트 보는 일반 Chrome, Slack |
| **포트 안 씀** | 네트워크 통신 없음 | 계산기, 메모장 |

### LISTEN 포트 vs ephemeral 포트

| | 서버 포트 (LISTEN) | ephemeral 포트 |
|---|---|---|
| 누가 정함 | 프로그램이 명시적으로 지정 | OS가 자동 할당 |
| 언제 잡음 | 프로그램 시작 시 | 외부 연결 만들 때 |
| 수명 | 프로그램 살아있는 동안 점유 | 연결 1개 끝나면 회수 |
| 용도 | 들어오는 연결 받기 | 내가 보낸 패킷의 "돌아올 주소" |
| 번호 범위 | 보통 1~49151 | macOS: 49152~65535 / Linux: 32768~60999 |

### 실제 동작 — Chrome으로 google.com 접속

```
[ 내 PC ]                                      [ google.com ]
Chrome                                          웹서버
  │ OS가 임시포트 54821 빌려줌                  │
  ├─ TCP src=내PC:54821  dst=google.com:443 ──▶
  │                                              │
  ◀── TCP src=google.com:443  dst=내PC:54821 ───┤
  │                                              │
  연결 종료 → OS가 54821 회수
```

비유:
- **서버 포트** = 가게의 고정 주소 (손님이 찾아와야 하니까 안 바뀜)
- **ephemeral 포트** = 택배 송장번호 (답신 받을 때만 필요, 끝나면 폐기)

### 같은 Chrome이라도

- **일반 Chrome** → ephemeral만 사용 (LISTEN 포트 없음)
- **`--remote-debugging-port=9223` Chrome** → 9223 LISTEN + 페이지 접속용 ephemeral 둘 다 사용

서버 역할을 한다고 클라이언트 역할이 사라지지 않는다. 디버깅 Chrome도 서핑은 평소처럼 잘 됨.

### 확인 명령어

```bash
# 누가 9223을 LISTEN 중인지
lsof -i :9223

# 내 mac의 ephemeral 범위
sysctl net.inet.ip.portrange.first net.inet.ip.portrange.last

# 모든 LISTEN 포트 (서버 역할 프로세스만)
lsof -iTCP -sTCP:LISTEN -P

# 지금 만들어진 outgoing 연결 (ephemeral 사용 중)
lsof -iTCP -sTCP:ESTABLISHED -P | head
```

---

## 5. 127.0.0.1 — "Chrome 서버"의 위치

CDP 포트는 외부 어딘가의 서버가 아니라 **내 컴퓨터에서 도는 Chrome 프로세스 안의 작은 서버**다.

```
[ 내 맥북 ]
 ├─ Chrome 프로세스 (디버깅 모드)
 │    └─ 내장 HTTP/WebSocket 서버
 │         └─ LISTEN: 127.0.0.1:9223
 │
 └─ Playwright/MCP 프로세스
      └─ http://127.0.0.1:9223 으로 접속 → Chrome 조작
```

`127.0.0.1`(=localhost)은 "이 컴퓨터 자기 자신". 외부에서 접근 불가. 같은 맥북 안의 프로세스끼리만 통신.

---

## 6. browser-verifier MCP vs 공식 Playwright MCP

둘 다 LLM이 조작한다는 점은 같지만 **설계 철학이 정반대**.

### 핵심 차이

| 비교 | 공식 Playwright MCP | browser-verifier (로컬) |
|---|---|---|
| 브라우저 | 자기가 `launch()`로 새 Chrome 띄움 | 내가 띄운 9223 Chrome에 `connectOverCDP` |
| 화면 | 헤드리스/별도 창, 사용자는 못 봄 | **내가 보는 화면 그대로** LLM이 조작 |
| 도구 추상화 | 자동화 primitive (click/type/select/...) | 검증 워크플로우 (check_console/check_network/verify/...) |
| 상태 모델 | 매 세션 클린 (쿠키/로그인 없음) | dev 세션 그대로 (로그인·라우팅 유지) |
| 노린 용도 | 일반 브라우저 자동화·E2E 작성 | "코드 바꾼 직후 회귀 점검" |

### 노출 도구로 보는 설계 의도

browser-verifier의 도구 목록 — 이름만 봐도 "verification cycle"이 1급 컨셉이라는 게 보임:

```
browser_setup            ← dev 서버 탭에 attach + console/network 버퍼 초기화
browser_check_console    ← 에러 로그 모아서 보기
browser_check_network    ← 4xx/5xx 요청만 모아서 보기
browser_semantic_state   ← DOM 의미를 텍스트로 요약 (스크린샷 대신)
browser_verify           ← "이게 보여야 한다" 단언
browser_sentinel_save    ← 검증 기준값 저장
browser_run_task         ← 사전 정의된 검증 task 재실행
browser_eval             ← React state 확인 등 same-page JS 실행
```

→ 클릭/타입 같은 일반 primitive는 일부러 작게 노출 (`browser_eval`로 대체 가능).

### AI 토큰 효율

| 시나리오 | 공식 MCP | browser-verifier |
|---|---|---|
| "콘솔 에러 났나?" | screenshot → vision 분석 or evaluate로 console 긁기 | `browser_check_console` 한 번 |
| "API 호출 잘 됐나?" | DevTools 못 보니까 코드/DOM 우회로 추정 | `browser_check_network` 한 번 |
| "이 컴포넌트 어떻게 렌더됐나?" | 큰 스크린샷 → vision 토큰 폭발 | `browser_semantic_state` 텍스트 요약 |

후자는 **vision 토큰 없이 텍스트로 끝나는 경우가 많아서 빠르고 쌈**.

### 언제 어느 것을 쓰나

- **로그인 필요한 dev 환경에서 "방금 바꾼 코드 회귀 점검"** → browser-verifier (현재 등록된 것)
- **외부 사이트 자동화, 폼 채우고 결과 긁기, E2E 시나리오 처음부터 작성** → 공식 Playwright MCP
- **픽셀 단위 시각 비교** → 둘 다 부적합 (browser-verifier 스킬도 *"NOT for pixel-perfect visual diffing"* 명시)

### 한 줄 요약

> **공식 Playwright MCP = 범용 브라우저 로봇팔.**
> **browser-verifier = 이미 보고 있는 화면에 대한 검증 전용 청진기.**
> 같은 일을 더 적은 토큰·더 적은 단계로 끝내는 게 본 MCP의 핵심.

---

## 부록 — 자주 헷갈리는 포인트 요약

1. **"Playwright Core를 쓰니까 9223 안 써도 되겠지?"** → 정반대. `connectOverCDP` 모드라서 9223이 **더 필요**.
2. **"일반 Chrome으로 디버깅 포트 못 띄우지?"** → 띄울 수는 있음. 다만 평소 Chrome이 이미 떠 있으면 옵션이 무시됨 (single-instance 락).
3. **"9223이 표준인가?"** → 아니다. Chrome은 어떤 포트든 OK. 9223은 본 MCP의 하드코딩 값일 뿐. (Playwright 관습적 디폴트는 9222)
4. **"일상용 Chrome의 기본 디버깅 포트는?"** → 없음. 옵션 안 주면 닫혀 있는 게 보안 디폴트.
5. **"포트는 Chrome 서버에 있는 건가?"** → 내 컴퓨터의 포트. Chrome 프로세스가 내장 서버를 띄워서 `127.0.0.1:9223`을 LISTEN 중일 뿐.
6. **"모든 프로그램이 포트를 점유하나?"** → 아니다. 서버 역할(LISTEN)만 점유. 클라이언트는 OS에서 빌려쓰는 ephemeral 포트.

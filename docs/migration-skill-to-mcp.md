# Browser Verifier — Skill → MCP 전환 정리

> 작성일: 2026-05-21
> 작성자: yangyoon@huray.net
> 기준 이전 버전: [yyoooon/claude @ 017c44b](https://github.com/yyoooon/claude/tree/017c44b0054d41ae6b0e19d20c639dea5ec6c0c5)

루트 Claude 스킬(단일 SKILL.md 텍스트)로 운영하던 브라우저 검증 도구를, **별도 MCP 서버 + 모듈화된 가이드 스킬** 구조로 전환한 작업 기록.

---

## TL;DR

| | 이전 (Phase 0) | 이후 (현재) |
|---|---|---|
| 스킬 구성 | 2개 단일 파일 — `browser-verification/SKILL.md` (31KB) + `agent-browser/SKILL.md` (19KB) | 1개 스킬, 3파일 — `SKILL.md` (1.3KB) + `protocol.md` (6.9KB) + `cli.md` (9.4KB) |
| 합계 | ~50KB monolithic | ~17.6KB 모듈화 |
| 실행 경로 | Bash `agent-browser` CLI 직접 호출, stdout 텍스트 파싱 | MCP 툴 11개 직접 호출, 구조화된 JSON 응답 |
| MCP 등록 | 없음 | `~/.claude.json` 전역 `mcpServers` |
| 동작 위치 | `~/.claude/skills/` (Claude 설정 repo) | `~/Desktop/HURAY/browser-verifier-mcp/` (webview-test와 형제) |

---

## 1. 변경 이유

### 1-1. 단일 SKILL.md 50KB 통째 로드 부담

Phase 0 시점의 두 스킬 모두 단일 파일 monolithic:

- `skills/browser-verification/SKILL.md` — **31,499 bytes / 611 lines** (검증 프로토콜: Tier, Skip Gate, Light/Full Path, Fix Loop, Sentinel)
- `skills/agent-browser/SKILL.md` — **19,692 bytes / 458 lines** (CLI 사용 카탈로그: Tool Selection Hierarchy, Navigation Boundary, 카테고리 1-a/1-b/2/3/4)

스킬 시스템 특성상 발화 시 **SKILL.md 전체가 컨텍스트에 로드**. 즉 검증을 SKIP 하는 경우에도 50KB가 한 번에 들어옴. 모듈화하지 않으면 분리 로드가 불가능.

### 1-2. 두 스킬로 분리된 채로 강한 결합

```
browser-verification (when/how-much)
   ↓ 본 스킬은 ... agent-browser CLI 디테일은 'agent-browser' 스킬 참고
agent-browser (how — CLI catalog)
```

`browser-verification`이 매번 `agent-browser` 스킬을 가리키는 구조 — 사실상 한 도구를 두 파일에 나눠둔 것. Claude가 검증을 시작하면 거의 항상 두 스킬을 같이 읽어야 함 → 분리 의미가 없고 토큰만 두 배.

### 1-3. CDP 호출 경로가 raw shell 만

모든 검증이 `agent-browser --cdp 9223 <subcommand>` Bash 호출. 출력은 stdout 텍스트 → Claude가 자연어로 파싱. 구조화된 응답을 받을 길이 없어서:

- `find text "X" click` 같은 한 줄 명령에도 stdout 해석 코드를 Claude가 매번 생성
- 에러 케이스(요소 못 찾음, navigation race 등)도 텍스트 패턴 매칭으로 분기
- 토큰/시간 모두 비효율

### 1-4. webview-test와 운영 모델 불일치

| 항목 | webview-test (참고) | browser 검증 (Phase 0) |
|---|---|---|
| MCP 서버 등록 | ✅ `~/.claude.json` | ❌ 없음 |
| 폴더 위치 | `~/Desktop/HURAY/webview-test-mcp/` | `~/.claude/skills/browser-verification/` + `~/.claude/skills/agent-browser/` |
| 빌드 산출물 | `dist/index.js` | 해당 없음 (스킬 텍스트뿐) |
| Claude 호출 방식 | MCP 툴 직접 호출 | Bash CLI 호출 |

같은 카테고리(브라우저 자동화) 도구가 서로 다른 두 모델로 관리되면 유지보수 인지 비용이 커짐. webview-test 패턴으로 통일하기로 결정.

---

## 2. 변경 방법

### 2-1. MCP 서버 코드 (사전 작업, 본 PR 이전에 존재)

`@modelcontextprotocol/sdk`를 사용한 stdio MCP 서버를 작성:

- 진입점: `src/server.ts`
- 11개 툴 정의: `browser_batch` / `browser_eval` / `browser_wait_url` / `browser_wait_text` / `browser_click` / `browser_navigate` / `browser_fill_input` / `browser_check_console` / `browser_check_network` / `browser_get_url` / `browser_is_visible`
- 핸들러: `src/tools/*.ts` → `src/core/agentBrowser.ts` → `execa("agent-browser", ["--cdp", "9223", ...])`

핵심 — MCP 서버는 **agent-browser CLI를 그대로 wrap**. CDP를 직접 다루지 않음. 이미 검증된 CLI 로직을 재사용.

### 2-2. 폴더 평탄화

monorepo 흉내(`browser-verifier-plugin/packages/browser-verifier/`)였던 위치를 webview-test와 형제로 평탄화:

```bash
mv ~/Desktop/browser-verifier-plugin/packages/browser-verifier \
   ~/Desktop/HURAY/browser-verifier-mcp
rmdir ~/Desktop/browser-verifier-plugin/packages \
      ~/Desktop/browser-verifier-plugin
```

### 2-3. 빌드

```bash
cd ~/Desktop/HURAY/browser-verifier-mcp
yarn build   # tsc → dist/server.js
```

### 2-4. 심볼릭 링크 2개 갱신

이동으로 깨진 링크 복구:

```bash
# 스킬 링크 — Claude가 인식하는 ~/.claude/skills/ 하위 경로
rm ~/.claude/skills/browser-verifier
ln -s ~/Desktop/HURAY/browser-verifier-mcp/skills \
      ~/.claude/skills/browser-verifier

# agent-browser CLI 바이너리 — homebrew bin 경로
rm /opt/homebrew/bin/agent-browser
ln -s ~/Desktop/HURAY/browser-verifier-mcp/node_modules/agent-browser/bin/agent-browser-darwin-arm64 \
      /opt/homebrew/bin/agent-browser
```

### 2-5. MCP 서버 전역 등록

`~/.claude.json` 의 top-level `mcpServers` 에 stdio 등록 (webview-test 옆):

```json
"browser-verifier": {
  "type": "stdio",
  "command": "node",
  "args": [
    "/Users/yoon/Desktop/HURAY/browser-verifier-mcp/dist/server.js"
  ],
  "env": {}
}
```

수정 전 백업: `~/.claude.json.bak.before-browser-verifier`

### 2-6. 스모크 테스트

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | node ~/Desktop/HURAY/browser-verifier-mcp/dist/server.js
```

→ 11개 툴 정상 응답 확인.

### 2-7. 스킬 모듈화 + 부정확 가이드 제거

Phase 0의 단일 50KB 두 파일을 본 도구가 통합/모듈화해 둔 결과물 정리:

| 파일 | 처분 | 사유 |
|---|---|---|
| `SKILL.md` | 인덱스로만 사용 (1.3KB) | 발화 시 최소 로드 |
| `protocol.md` | 유지 (6.9KB) | when/how-much — `browser-verification/SKILL.md` 의 본체 |
| `cli.md` | 유지 (9.4KB) | how (CLI/MCP 선택) — `agent-browser/SKILL.md` 의 본체 |
| `routing.md` | 삭제 (129B) | protocol.md에 이미 흡수돼 있음 |
| `execution.md` | 삭제 (292B) | `verifyNavigation()` 같은 **실재 안 하는 JS 함수명** 권장 |
| `debugging.md` | 삭제 (90B) | 일반론, `systematic-debugging` 스킬과 중복 |
| `examples.md` | 삭제 (271B) | execution.md와 동일한 가짜 API 예시 |

최종: **3 파일 / ~17.6KB** — Phase 0 대비 약 65% 축소.

---

## 3. 변경 후 구조

```
~/Desktop/HURAY/
├── browser-verifier-mcp/          ← MCP 본체
│   ├── package.json
│   ├── src/
│   │   ├── server.ts              ← MCP stdio 서버 진입점
│   │   ├── tools/                 ← 11개 툴 정의 + 핸들러
│   │   ├── core/agentBrowser.ts   ← execa로 agent-browser CLI 호출
│   │   ├── actions/ checks/ react/
│   │   └── ...
│   ├── dist/                      ← yarn build 산출물
│   │   └── server.js              ← ~/.claude.json이 가리키는 entry
│   ├── skills/                    ← 가이드 (Claude 스킬로 노출)
│   │   ├── SKILL.md               ← 발화 시 자동 로드 (1.3KB)
│   │   ├── protocol.md            ← 검증 프로토콜 (6.9KB)
│   │   └── cli.md                 ← MCP/CLI 선택 + 패턴 (9.4KB)
│   ├── node_modules/
│   │   └── agent-browser/bin/     ← /opt/homebrew/bin/agent-browser 가 가리킴
│   └── docs/
│       └── migration-skill-to-mcp.md   ← 이 문서
│
└── webview-test-mcp/              ← 동일 패턴 (참고 모델)
```

**런타임 흐름:**

```
Claude
  │
  ├─ Skill: ~/.claude/skills/browser-verifier  (symlink → mcp/skills/)
  │   "언제/얼마나/어떤 패턴으로 검증할지"의 가이드
  │
  └─ MCP 툴 호출: mcp__browser-verifier__browser_navigate(...)
      │
      └─ node mcp/dist/server.js   (stdio, ~/.claude.json 등록)
          │
          └─ execa("agent-browser", ["--cdp", "9223", ...])
              │
              └─ Chrome (CDP port 9223)
```

---

## 4. 효과

### 4-1. 토큰 효율 — 발화 시 로드량 약 97% 감소

| 시점 | SKIP 시 컨텍스트에 들어오는 텍스트 |
|---|---|
| Phase 0 (단일 SKILL.md × 2) | 31KB + 19KB = **약 50KB 통째** |
| 현재 (모듈화) | SKILL.md 1.3KB **만 자동 로드**. 나머지는 필요 시 Read |

검증 SKIP 빈도(코드 변경 없음 / wiring-only) 고려하면 누적 절약 효과 큼.

검증 실행 시에도:

- Light path: SKILL + protocol = ~8.2KB
- Light path + CLI 호출 패턴 참조: + cli.md ~17.6KB
- 둘 다 Phase 0의 50KB 대비 적음

### 4-2. CDP 호출 — 구조화 응답

| 시나리오 | Phase 0 (Bash CLI) | 현재 (MCP) |
|---|---|---|
| "버튼 X 클릭 후 /dashboard 이동 확인" | `agent-browser --cdp 9223 batch "find text 'X' click" "wait --url '**/dashboard'" "get url"` 호출 후 stdout 텍스트 파싱 | `browser_navigate({clickText: "X", expectedUrl: "/dashboard"})` 1콜, JSON 응답 |
| 응답 처리 | Claude가 stdout 자연어 해석 → 분기 코드 자동 생성 | 스키마 기반 JSON, 파싱 비용 0 |
| 에러 케이스 분기 | 텍스트 패턴 매칭 | `isError: true` 플래그 |

### 4-3. 스킬 인식 정확도

- 잡파일 4개 제거 → SKILL.md 인덱스가 실제 컨텐츠와 일치
- Claude가 **가짜 API명(`verifyNavigation()`, `fillReactInput()`)** 을 따라 호출할 위험 제거
- 두 스킬 → 한 스킬로 통합되어 "어느 스킬을 어디서 봐야 하지" 판단 비용 제거

### 4-4. webview-test와 일관된 운영 모델

- 폴더 위치: `~/Desktop/HURAY/` 형제
- 등록 위치: `~/.claude.json` 전역 `mcpServers`
- 빌드 방식: `yarn build` → `dist/*.js`
- 업데이트 절차도 동일하게 적용 가능

### 4-5. 도구 분업이 명확해짐

| 단계 | 도구 |
|---|---|
| 개발 중 빠른 피드백 (Stop hook 자동 검증) | `browser-verifier` (데스크탑 Chrome 9223) |
| 머지 직전 실기기 동작 확인 | `webview-test` (Android WebView) |
| CareHubBridge 네이티브 호출 | `webview-test` 만 가능 |
| 픽셀/시안 일치 판정 | 둘 다 X — 영역 외 |

---

## 5. 개선점

이번 전환에서 함께 처리한 것들:

1. **부정확 가이드 제거** — `verifyNavigation()` / `fillReactInput()` 같은 실재 안 하는 JS 함수명을 권장하던 가이드 파일 4개 삭제
2. **MCP vs Bash CLI 경계 규칙 통합** — Phase 0에 두 스킬에 분산돼 있던 결정 트리를 `cli.md` "Tool Selection Hierarchy" 한 곳으로 집중
3. **빌드 파이프라인 가동** — Phase 0엔 빌드라는 개념 자체가 없었음. `yarn build` 후 `dist/server.js`가 entry point로 동작
4. **CLI 바이너리 경로 일원화** — `/opt/homebrew/bin/agent-browser` 가 일관된 위치를 가리킴

---

## 6. 트레이드오프

### 6-1. 의존 체인이 한 단계 길어짐

```
Phase 0:   Claude → Bash → agent-browser CLI → CDP → Chrome
현재:      Claude → MCP server → execa → agent-browser CLI → CDP → Chrome
```

단계당 오버헤드는 ms 단위라 실사용엔 무시 가능하지만, 디버깅 시 추적 경로가 더 길어짐. 트레이드오프로 얻은 게 더 큼 (구조화된 JSON 응답, 스키마 검증, 토큰 효율).

### 6-2. agent-browser CLI 의존이 그대로 남음

MCP 서버는 결국 `execa("agent-browser", ...)` 로 CLI를 shell out 호출. **CLI를 wrapper로 감싼 형태**라 agent-browser 자체의 버그/version drift 영향을 그대로 받음.

CDP를 MCP 서버 안에서 직접 다루는 형태로 가지 않은 것은 의도적 선택 — CLI에 이미 검증된 로직(navigation race 보호, React input setter, find 로케이터 등)이 충분하고, 이걸 다시 짤 가치가 없음.

### 6-3. Claude Code 재시작 의존성

`~/.claude.json` 수정 후 **Claude Code 재시작 필요** — MCP 서버는 세션 시작 시점에 spawn. 핫리로드 불가. 스킬 파일 변경은 재시작 없이 반영되지만 MCP 툴 추가/제거는 재시작 필수.

Phase 0 시점엔 모든 게 텍스트 + Bash라 재시작 자체가 불필요했던 것 대비 단점.

### 6-4. 전역 등록의 영향 범위

`~/.claude.json` 전역 `mcpServers` 등록 → **모든 프로젝트에서 자동으로 spawn**. 메모리 ~30-50MB 정도. 사용 안 하는 프로젝트에서도 idle 프로세스가 남음.

프로젝트 한정으로 두려면 `.mcp.json` 으로 이동 필요하지만, 본 도구는 여러 프로젝트에서 공통 사용 가정이라 전역이 적절.

### 6-5. Phase 0의 단순함 상실

Phase 0은 git repo(`yyoooon/claude`)에 텍스트 파일만 있으면 동작했음. 다른 머신에서 환경 복제하려면:

- Phase 0: `git clone` 한 번
- 현재: clone + `yarn install` + `yarn build` + `~/.claude.json` 수정 + symlink 2개 + Claude 재시작

설치 비용은 1회성이지만 명시적인 단계가 늘어남.

---

## 7. 롤백 절차

문제 발생 시:

### 7-1. 부분 롤백 (MCP 등록만 해제, 스킬은 유지)

```bash
cp ~/.claude.json.bak.before-browser-verifier ~/.claude.json
# Claude Code 재시작
```

MCP 툴은 사용 불가가 되지만 스킬 가이드와 Bash CLI 호출은 그대로 작동.

### 7-2. 완전 롤백 (Phase 0으로)

기준 시점의 두 스킬 원본을 받아와서 `~/.claude/skills/` 하위에 복원:

```bash
# 1. Phase 0 시점의 두 스킬 파일 fetch
mkdir -p ~/.claude/skills/browser-verification ~/.claude/skills/agent-browser
gh api repos/yyoooon/claude/git/blobs/49251a8505c5bd7c235aeb4e710d584170210dd0 \
  --jq '.content' | base64 -d > ~/.claude/skills/browser-verification/SKILL.md
gh api repos/yyoooon/claude/git/blobs/1905aa02d29120f56cb7a8b9f06150109910283e \
  --jq '.content' | base64 -d > ~/.claude/skills/agent-browser/SKILL.md

# 2. 새 스킬 심볼릭 링크 제거
rm ~/.claude/skills/browser-verifier

# 3. ~/.claude.json 백업 복원
cp ~/.claude.json.bak.before-browser-verifier ~/.claude.json

# 4. (선택) MCP 폴더 보존하되 비활성화 — 디스크에는 두고 등록만 빼는 방식
```

`agent-browser` CLI 바이너리(`/opt/homebrew/bin/agent-browser`)는 그대로 두면 Phase 0 시절처럼 Bash 호출로 동작.

---

## 8. 검증 체크리스트

- [x] `dist/server.js` 생성됨
- [x] `~/.claude/skills/browser-verifier` 심볼릭 링크가 새 경로를 가리킴
- [x] `/opt/homebrew/bin/agent-browser` 심볼릭 링크 동작 (`agent-browser --version` → 0.27.0)
- [x] `~/.claude.json` JSON 파싱 정상
- [x] MCP 서버 stdio 응답 정상 — `tools/list` 에 11툴 반환
- [ ] **Claude Code 재시작 후 deferred tools에 `mcp__browser-verifier__*` 등장 확인** ← 사용자 액션 필요

---

## 9. 참고

- 이전 버전 commit: [yyoooon/claude @ 017c44b](https://github.com/yyoooon/claude/tree/017c44b0054d41ae6b0e19d20c639dea5ec6c0c5)
  - `skills/browser-verification/SKILL.md` (31,499 bytes / 611 lines)
  - `skills/agent-browser/SKILL.md` (19,692 bytes / 458 lines)
- 동일 패턴 참고: `~/Desktop/HURAY/webview-test-mcp/`
- MCP SDK: `@modelcontextprotocol/sdk` ^1.12.0
- agent-browser CLI: v0.27.0
- 백업: `~/.claude.json.bak.before-browser-verifier`

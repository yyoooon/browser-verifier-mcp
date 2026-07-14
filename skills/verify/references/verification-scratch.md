# Verification Scratch — 저장 위치·수명·체크리스트

검증하면서 만드는 자산(figma 스펙, 반복 인터랙션 task, 수용 체크리스트)을 **어디에 두고 언제 지우는지**의 규약. 전부 **로컬·gitignored·커밋 안 함**이 원칙.

## 레이아웃

```
<repo>/.browser-verifier/
├── <branch-slug>/          ← 그 브랜치(기능)에서 만드는 scratch
│   ├── figma-specs/*.json  ← figma_spec (디자인 충실도)
│   ├── tasks.json          ← 반복 인터랙션 플로우
│   └── checklist.md        ← 요구사항에서 뽑은 수용기준
└── _shared/                ← 브랜치 무관 공통 헬퍼 (로그인·시드 등)
    └── tasks.json
```

- `<branch-slug>` = **현재 브랜치명에서 `/` → `-`** (예: `feat/chat` → `feat-chat`). `git branch --show-current`로 얻는다. main 작업이면 `main/`.
- **전부 gitignored.** SessionStart 훅이 `.browser-verifier/`가 있으면 `.gitignore`에 자동 추가(idempotent) → 실수 커밋 방지. **아무것도 커밋하지 않는다.**

## 수명

| 자산 | 언제 사라지나 |
|---|---|
| `<branch-slug>/` (specs·tasks·checklist) | **그 브랜치가 삭제되면** — SessionStart 스윕이 "git에 없는 브랜치 폴더"를 rm. 기능 끝(머지·삭제) = scratch 폐기 |
| `_shared/` | **명시 삭제 전까지 유지** (스윕 제외) |

- 작업 **중**엔 브랜치가 살아있으니 절대 안 지워짐 (멀티세션 OK).
- 브랜치 무관 폴더(비규약 이름)는 다음 세션 스윕에서 정리됨 → 규약대로 `<branch-slug>/`에 둘 것.
- main 작업물은 `main/`에 두면 main 브랜치가 항상 살아있어 유지.

## 무엇을 저장하고 무엇을 안 하나 (3층 판단)

검증 자산을 만들 때 두 질문으로 층을 정한다:

```
Q1. 여러 번 돌리나?        → 저장 vs 1회용
Q2. 앞으로도 안 깨져야 하나? → E2E vs 로컬
    ("3개월 뒤 조용히 깨지면 얼마나 나쁘고, 다른 게 잡아주나?")
```

| 층 | 처리 |
|---|---|
| **1회용** (한 번 보고 끝) | 인라인 (`browser_verify`/`run_task({steps})`), **저장 안 함** |
| **로컬 재사용** (만드는 동안 반복, 영구 보증은 안 함) | `.browser-verifier/<branch>/`에 저장 (여기 규약) |
| **영구 회귀 가드** (핵심, 계속 지켜야) | **E2E(Playwright)** 로 승격 — 이 폴더 아님, 커밋·CI |

> E2E 승격 타이밍: 처음부터 X(DOM churn). 플로우가 **안정 + 앞으로도 지킬 핵심**이 되는 순간. 멀티계정·실시간 플로우는 Playwright 멀티컨텍스트가 적합하지만 — "강점 ≠ 의무", Q2가 결정한다.

## 요구사항 → 체크리스트 (checklist.md)

기능을 **만들거나 수정하라는 요구사항**을 받으면, 코딩 전에 그 요구사항을 **검증 가능한 수용기준**으로 바꿔 `checklist.md`에 저장한다. (구현 편향이 기대값에 스미기 전에 기준을 못박아 drift·누락 방지.)

- **복잡도 비례**: 진짜 기능/수정만. 1줄짜리 사소한 수정은 생략.
- **자동/수동 표시**: 각 항목이 기계 검증 가능한지 표시.
  - 자동 → `figma-specs/`(디자인) 또는 `tasks.json`(플로우)로 실행.
  - 수동(주관적: "애니메이션 자연스러움") → 체크리스트에 남기고 사람이 확인.

예 `checklist.md`:
```md
# feat/chat 수용기준

## 자동 (browser-verifier)
- [ ] A가 반응 전송 → B 화면에 토스트 렌더  → tasks.json: react-to-toast
- [ ] 채팅 버블 색/타이포 시안 일치         → figma-specs/bubble.json
- [ ] 전송 후 입력창 비워짐

## 수동 (사람 확인)
- [ ] 토스트 등장 애니메이션이 자연스러움
```

**워크플로:**
```
1. [사용자] 요구사항
2. [에이전트] 요구사항 → checklist.md (자동/수동 표시) → 사용자 확인
3. [에이전트] 구현
4. [에이전트] checklist의 자동 항목을 verify로 반복 (통과할 때까지 loop)
5. 자동 전부 통과 + 수동 사용자 확인 → 완료
   (브랜치 정리하면 checklist·specs·tasks 자동 청소)
```

## 요약
- 위치: `.browser-verifier/<branch-slug>/` (+ 공통은 `_shared/`), 전부 로컬·gitignored·커밋 X.
- 수명: 브랜치 살아있는 동안 유지 → **브랜치 삭제 시 자동 청소**(`_shared` 제외).
- 요구사항 받으면 `checklist.md`부터(자동/수동 구분), 자동 항목으로 반복 검증.
- 영구 보증이 필요한 핵심만 E2E로 승격(이 폴더 밖).

# Contributing

이 repo에 코드 변경을 commit하려는 사람용 가이드. (Plugin 단순 사용자는 [README](./README.md)만 보면 됨.)

## 핵심 — `dist/` 가 src와 같이 commit돼야 함

이 repo는 Claude Code plugin 배포용이라 `dist/` 빌드 산출물도 commit한다. Plugin install이 `npm run build`를 안 돌리고 그대로 사용하기 때문.

즉 **src/ 수정 → 매번 `npm run build` → dist/ 같이 commit** 흐름이 필요.

수동으로 이걸 매번 하면 잊기 쉬워서 **두 단계 자동화**를 둠.

## (1) 로컬 — pre-commit hook

한 번만 셋업:

```bash
git clone https://github.com/yyoooon/browser-verifier-mcp.git
cd browser-verifier-mcp
npm install
./scripts/install-hooks.sh
```

이후 src/ 수정 + commit 흐름:

```bash
# src/foo.ts 수정
git add src/foo.ts
git commit -m "feat: ..."
# → pre-commit hook이 자동으로:
#   1. rm -rf dist + npm run build
#   2. git add dist/
#   3. commit 진행
```

빌드가 실패하면 commit이 abort됨 (TypeScript 에러 등을 commit 전에 잡아냄).

우회가 필요하면 `git commit --no-verify` — 다음 단계 CI에서 잡힘.

## (2) CI — GitHub Action 안전망

`.github/workflows/build-check.yml` 이 push/PR마다:

1. `npm ci`
2. `rm -rf dist && npm run build`
3. `git diff --exit-code dist/` — 어긋나면 fail

pre-commit hook이 우회됐거나, hook 없는 머신에서 commit한 경우 push 단계에서 잡힘.

## 다른 머신에서 작업할 때

```bash
git pull
./scripts/install-hooks.sh    # 한 번만 — clone마다 1회
```

`.git/` 디렉토리는 머신별이라 hook도 머신별 설치 필요.

## Skill / Hook 변경 후

`skills/`, `agents/`, `commands/`, `hooks/` 파일은 빌드 불필요 (markdown / bash 그대로). dist/ 안 건드림. 그냥 commit.

## 새 phase 작업

리팩터 phase별 doc은 `docs/refactor-phase-*.md`. 새 큰 작업하면 새 phase doc 추가 (Phase 8까지 있음).

## 질문 / 버그 / 제안

GitHub Issues — https://github.com/yyoooon/browser-verifier-mcp/issues

---
description: Enable browser-verifier auto-trigger on code changes (Stop event)
---

browser-verifier의 자동 검증을 켭니다. 켜진 후 코드 수정이 끝날 때마다(`Stop` 이벤트) gate hook이 git diff를 보고 검증 대상 변경이 있으면 자동으로 검증 사이클을 시작합니다.

다음 명령을 정확히 실행하세요. 추가 질문이나 확인 없이 한 번에:

```bash
touch "$HOME/.browser-verifier-auto"
```

성공하면 한 줄로 보고:

```
✅ Auto-verify 켜짐 — 코드 수정마다 자동 검증이 트리거됩니다. 끄려면 `/browser-verifier:disable-auto`.
```

이미 파일이 있어도 (`touch`는 idempotent하니까) 같은 메시지로 보고하세요.

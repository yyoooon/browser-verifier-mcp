---
description: Disable browser-verifier auto-trigger on code changes
---

browser-verifier의 자동 검증을 끕니다. 끈 후엔 사용자가 명시적으로 "검증해줘" 같이 요청해야 사이클이 시작됩니다.

다음 명령을 정확히 실행하세요. 추가 질문이나 확인 없이 한 번에:

```bash
rm -f "$HOME/.browser-verifier-auto"
```

성공하면 한 줄로 보고:

```
✅ Auto-verify 꺼짐 — 자동 검증 비활성. 다시 켜려면 `/browser-verifier:enable-auto`.
```

파일이 원래 없었어도 (`rm -f`는 idempotent하니까) 같은 메시지로 보고하세요.

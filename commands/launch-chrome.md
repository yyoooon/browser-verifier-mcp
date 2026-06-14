---
description: Launch (or reuse) dev Chrome with CDP debugging port — pairs browser-verifier with agent-browser on the same instance
argument-hint: "[port]"
---

dev용 Chrome을 별도 인스턴스로 띄웁니다. browser-verifier와 agent-browser(쓰는 경우)가 같은 Chrome을 공유하도록 CDP 디버깅 포트를 엽니다.

**포트 우선순위**: 인자 > `$BROWSER_VERIFIER_CDP_URL` > `9223` (기본).
**user-data-dir**: `~/.cache/browser-verifier/chrome-<port>` (또는 `$BROWSER_VERIFIER_CHROME_USER_DATA_DIR`).
**Idempotent**: 이미 떠있으면 그대로 보고하고 종료.

다음 명령을 정확히 실행하세요. 추가 질문이나 확인 없이 한 번에:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/launch-chrome.sh" $ARGUMENTS
```

스크립트가 출력한 `✓ ...` 또는 `❌ ...` 메시지를 **그대로 한 줄로 보고**하세요. 추가 해설 X.

실패 시(`❌`로 시작):
- macOS 외 환경이면 `$GOOGLE_CHROME_APP` 또는 직접 Chrome 실행 안내
- 포트 충돌이면 `pgrep -af 'remote-debugging-port'` 결과 안내

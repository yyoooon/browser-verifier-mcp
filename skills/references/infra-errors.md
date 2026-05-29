# Infra Error 처리표

| 케이스 | 동작 |
|---|---|
| Dev 서버 미기동 (PORT LISTEN 없음) | 메시지 + sentinel + 종료. 수정 루프 진입 X. |
| Chrome 9223 미기동 / 매칭 탭 없음 | "검증용 Chrome 9223으로 :PORT 탭 열어주세요" + sentinel + 종료. **자체 spawn 금지.** |
| Auth 토큰 없음 / 보호 라우트 | SKIP + 사유 알림 |
| Diff > 300줄 / 광범위 리팩터 | SKIP + "manual review recommended" |
| `.browser-verifier/tasks.json` 없음 | 정상 — Standard Cycle 2번에서 silent skip. 사용자에게 알림 X. |
| tasks.json 파싱 실패 | "tasks.json 파싱 실패 — 해당 사이클은 task 없이 진행" 1줄 알림 + verify/eval로 진행 |

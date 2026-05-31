# Wiring-Only Skip Gate

3조건 모두 충족 → silent SKIP (sentinel만 저장, 사용자 채팅 출력 X).

## 3 조건

1. **wiring 단순** — signature 변경 없는 prop 추가/교체, 문자열 상수 수정, className/variant 값 교체. 새 로직/조건부 렌더 없음.
2. **동일 패턴이 코드베이스 다른 곳에서 이미 동작 중** — 처음 등장하는 패턴이면 SKIP X.
3. **잘못되면 사용자가 1클릭으로 즉시 catch 가능** — UI에 노출된 인터랙션.

## SKIP 예시

- 기존 컴포넌트에 `onClick` prop 추가 (다른 페이지에서 동작 검증된 패턴)
- `router.push('/A')` → `router.push('/B')` 인자 교체
- `variant="default"` → `variant="ghost"` 같은 prop 값 교체
- Tailwind class 문자열 교체

## SKIP 안 함

- 핸들러 내부 로직 변경 (toast, mutation, 상태 전환)
- 새 컴포넌트 mount / 조건부 렌더 추가
- 같은 패턴이 코드베이스에 처음 등장

## 통과 시 동작

`browser_sentinel_save()` 호출 후 silent 종료. 사용자 채팅 출력 X.

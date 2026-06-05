# browser_verify는 검증을 어떻게 처리하나 (4단계)

> `browser_verify` 한 번 호출이 내부에서 어떤 순서로 돌아가는지, 실제 예시
> 하나로 천천히 따라가는 문서. 코드는 `src/runtime/verify/runVerify.ts`.

---

## 예시 — 이 검증을 시켰다고 하자

```ts
browser_verify({
  checks: [
    { type: "route",          expected: "**/dashboard" },          // 주소 확인
    { type: "loaded",         timeoutMs: 3000 },                   // 로딩 끝났나
    { type: "computed_style", selector: "[data-slot=card]", prop: "padding", expected: "16px" },  // 카드 여백
    { type: "class_present",  selector: "[data-slot=card]", className: "bg-blue" },               // 카드 클래스
  ]
})
```

이 4개를 내부에서 **① 추출 → ② 대기 → ③ 조회 → ④ 비교** 순으로 처리해요.

---

## ① 상태 한 번 추출 — "화면 사진 1장 찍기"

```ts
let state = await extractSemanticState(page);
```

**무엇을:** 화면의 공통 정보(주소·모달·에러·로딩·제목...)를 **한 번에** 긁어와요.

**왜 한 번만?** route, loaded 같은 검사가 여러 개여도 **매번 화면을 다시 안 봐도** 되니까. 사진 1장 찍어두고 거기서 다 확인.

```
state = {
  route: "/dashboard",
  loading: false,
  errors: [],
  headings: ["건강 지표"],
  ...
}
```

> 비유: 의사가 **검진 결과지 1장** 받아두고, 거기서 키도 보고 몸무게도 보고. 항목마다 다시 재지 않음.

---

## ② 필요하면 대기 — "아직 로딩 중이면 잠깐 기다려"

```ts
if (needsLoadedRetry && state.loading && timeoutMs > 0) {
  state = await pollLoaded(page, timeoutMs, state);
}
```

**무엇을:** `loaded` 검사가 있는데 화면이 **아직 로딩 중**이면, 끝날 때까지 잠깐 기다려요.

`pollLoaded` 안:
```ts
while (state.loading && 시간 안 지남) {
  await 150ms 쉬기;        // 0.15초 기다리고
  state = 다시 사진 찍기;   // 또 확인
}
```

→ **0.15초마다 "다 됐어?" 다시 확인.** 최대 3초(timeoutMs)까지. 다 되면 바로 통과.

**왜?** React 화면은 처음엔 비어있다가 잠깐 뒤에 채워져요. 너무 빨리 검사하면 "아직 안 떴는데?" 하고 잘못 실패해요(flaky). 그걸 **코드가 알아서** 막아줘요.

> 비유: 라면 끓일 때 "다 익었나?" 들여다보는 것. 익으면 바로 먹고, 안 익었으면 조금 더.

→ 이게 **"HOW(타이밍)는 코드가 처리"**의 실제 모습이에요.

---

## ③ DOM 한 콜로 조회 — "세밀한 항목은 몰아서 한 번에"

```ts
const raw = await runDomQueries(page, domQueries);  // 여러 셀렉터를 1번에
```

**무엇을:** `computed_style`, `class_present` 같은 **UI 전용 검사**들을 모아서 브라우저에 **딱 한 번** 물어봐요.

위 예시엔 카드 검사가 2개(padding, class)죠. 따로따로 2번 묻지 않고 묶어서 1번에:

```ts
// 브라우저 안에서 실행
queries.map((q) => {
  const el = document.querySelector(q.selector);                     // 그 요소 찾기
  if (q.kind === "style") return getComputedStyle(el)[q.prop];       // 스타일 값 꺼내기
  if (q.kind === "class") return el.classList.contains(q.className); // 클래스 있나
})
```

**왜 묶어?** 브라우저랑 대화하는 건 "전화 거는 것"과 비슷해요. 검사 10개면 전화 10번이 아니라 **전화 1번에 10개 질문** → 훨씬 빠르고 토큰도 적게 써요.

> 비유: 심부름. 가게에 10번 왔다갔다 vs **메모지 1장에 10개 적어서 한 번에.**

**참고:** ①(상태 사진)은 route·modal 같은 **공통 정보**, ③(DOM 조회)은 카드 padding 같은 **UI 전용**. 둘을 나눠서 각각 효율적으로 처리해요.

---

## ④ type별로 갈라 기계 비교 — "항목마다 정답지랑 대조"

```ts
const results = checks.map((c, idx) => {
  if (DOM_CHECK_TYPES.has(c.type)) return runDomCheck(c, ...);   // 스타일/클래스면
  return runStateCheck(c, state);                                // 주소/모달/에러면
});
ok: results.every((r) => r.ok)   // 전부 통과해야 최종 ✅
```

**무엇을:** 검사 하나하나를 **종류(type)에 맞는 비교 코드**로 보내서 ✅/❌ 판정.

각 비교는 **기계적 대조**예요:
```ts
route:          globMatch("**/dashboard", "/dashboard")  → ✅
loaded:         state.loading == false                   → ✅
computed_style: "16px" === "16px"                        → ✅
class_present:  classList.contains("bg-blue")            → ✅
```

마지막에 `every` — **하나라도 ❌면 전체 실패**, 다 ✅여야 통과.

> 비유: 시험 채점. 문항별로 정답지와 대조 → 한 문제 틀려도 "전체 만점"은 아님.

---

## 전체를 한 그림으로

```
검사 4개 들어옴
   │
①  화면 사진 1장 찍기 (route, loading, errors... 공통정보)
   │
②  loaded 검사 있고 아직 로딩중? → 끝날 때까지 0.15초씩 대기
   │
③  카드 검사(style/class) 2개 → 브라우저에 전화 1번에 몰아 물어봄
   │
④  검사마다 type 보고 → 맞는 비교 코드로 → 기계 대조 → ✅/❌
   │
   └→ 전부 ✅ ? → 최종 PASS  /  하나라도 ❌ ? → FAIL (어디 틀렸는지 메시지)
```

---

## 핵심 4가지

| 단계 | 똑똑한 점 |
|------|-----------|
| ① 한 번 추출 | 공통정보는 사진 1장으로 재활용 |
| ② 대기 | 타이밍 실패(flaky)를 코드가 막음 |
| ③ 몰아서 조회 | 브라우저 왕복 최소화 → 빠름·저토큰 |
| ④ 기계 비교 | AI 추론 없이 1:1 대조 → 항상 일정 |

---

## 한 줄 요약

> `browser_verify`는 **① 상태 한 번 추출 → ② 필요하면 대기 → ③ DOM 한 콜로 조회 → ④ type별로 갈라 기계 비교 → ⑤ 전부 통과해야 ✅**.
> 이래서 **빠르고(왕복 적음) + 안 흔들리고(기계 비교) + flaky 없는(자동 대기)** 검증이 돼요. 😊

# HTML5 video 시크 중 발생하는 가짜 pause/play 이벤트

## 2026-08-28 — 강의 영상을 앞뒤로 드래그(시크)할 때 음악이 오탐 재생되는 문제

### 왜 발생하는가
`<video>` 엘리먼트를 스크러빙(시크)하면, 새 재생 위치의 데이터가 아직 버퍼링되지 않은 상태이므로 플레이어가 내부적으로 재생을 잠깐 멈췄다가(리버퍼링 동안 재생 시계를 멈추기 위해 실제로 `pause()`를 호출) 데이터가 준비되면 다시 `play()`를 호출하는 경우가 흔하다. 특히 YouTube처럼 자체 플레이어가 `<video>` 엘리먼트를 감싸고 있는 사이트는 이 내부 pause/resume이 더 빈번하게 관찰된다. 문제는 이게 **표준 `pause`/`play` 이벤트로 그대로 발생**하기 때문에, 바깥에서 이 두 이벤트만 구독하면 "사용자가 진짜로 멈췄다"와 "시크 중 잠깐 멈췄다"를 구분할 수 없다는 점이다.

### 대응: 디바운스
`pause` 이벤트가 오면 바로 반응하지 않고, 짧은 시간(300~500ms 범위)만큼 지연시켰다가 그 시점에 `el.paused`를 다시 확인한 뒤에만 "진짜 멈춤"으로 처리한다. 그 사이에 `play` 이벤트가 오면 대기 중이던 타이머를 취소한다.

```js
let pauseTimer = null;
el.addEventListener("pause", () => {
  if (pauseTimer) clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => {
    pauseTimer = null;
    if (el.paused) notifyPaused(); // 지연 후 재확인
  }, 400);
});
el.addEventListener("play", () => {
  if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
  notifyPlaying(); // 재개는 즉시 반응해도 됨
});
```

- 시크로 인한 pause→play 왕복은 보통 수백 ms 안에 끝나므로, 400ms 정도면 대부분 흡수된다.
- `play` 쪽은 디바운스하지 않고 즉시 반응하는 게 자연스럽다 — "재개했는데 반응이 늦다"는 체감 지연이 더 거슬리기 때문에, 오탐 억제가 필요한 쪽(pause)만 지연시키고 반응성이 중요한 쪽(play)은 그대로 둔다.
- `seeking`/`seeked` 이벤트도 표준으로 존재하지만, 이 디바운스만으로 시크로 인한 짧은 블립은 대부분 걸러지므로 필수는 아니다. 다만 광고 전환처럼 pause 상태가 디바운스 시간보다 오래 지속되는 경우는 이 방식으로 걸러지지 않는다는 한계가 있다 — 반응성(빠른 감지)과 오탐 억제(긴 디바운스) 사이의 트레이드오프이므로, 값을 늘리면 오탐은 줄지만 실제 pause 반응이 그만큼 느려진다.

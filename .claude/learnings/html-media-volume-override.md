# 웹 미디어 엘리먼트 볼륨이 사이트에 의해 되돌아가는 이유와 대응

## 2026-08-28 — music-transition 확장에서 음악 탭 볼륨이 몇 초 뒤 커지는 문제 조사

### 왜 사이트가 볼륨을 되돌리는가
가장 흔한 이유는 **세션 간 사용자 선호 볼륨 유지**다. 예를 들어 YouTube는 `localStorage["yt-player-volume"]`에 마지막으로 설정한 볼륨을 저장해두고, 새 영상을 로드하거나 페이지를 다시 열 때 그 값을 다시 적용한다. 외부 스크립트(확장 등)가 `.volume`을 임의로 바꿔도, 사이트 자신의 로직이 몇 초 뒤(영상 로드 완료 시점 등) 저장된 값으로 덮어써 버리는 것.

### 메커니즘: `HTMLMediaElement.volume`과 `volumechange` 이벤트
`.volume`/`.muted` 속성이 바뀌면 그게 스크립트에 의한 대입이든 사용자가 UI로 조작한 것이든 구분 없이 `volumechange` 이벤트가 발생한다(MDN 명세). 즉 "누가 볼륨을 바꿨는지"는 이 이벤트만으로는 알 수 없고, "바뀌었다"는 사실만 알 수 있다.

### 함정: Web Audio API `GainNode`로 볼륨을 제어하는 사이트
`AudioContext.createMediaElementSource(el)`로 `<video>`/`<audio>` 엘리먼트를 오디오 그래프에 연결하면, 재생 경로 자체가 AudioContext의 처리 그래프로 재라우팅된다(MDN 명시). 이 그래프에 `GainNode`가 끼어 있는 사이트라면, 실제로 들리는 소리 크기는 `.volume` 속성이 아니라 그 `GainNode`의 `gain` 값이 결정한다. 이 경우 `.volume`을 아무리 강제로 되돌려도 실제 소리에는 영향이 없고, 심지어 `volumechange` 이벤트 자체가 안 뜰 수도 있다(감시 대상 속성이 바뀌지 않으므로). 라우드니스 정규화 같은 기능이 있는 스트리밍 플레이어일수록 이런 구조를 쓸 가능성이 높다.

### 대응 패턴 1 — "감시자(watcher)" 패턴 (약~중간 강도)
목표 볼륨을 변수로 계속 기억해두고, 엘리먼트의 `volumechange` 이벤트를 구독하다가 실제 값이 목표에서 벗어나면 즉시 되돌리는 방식.

```js
let desiredVolume = 0.5;
el.addEventListener("volumechange", () => {
  if (Math.abs(el.volume - desiredVolume) > EPSILON) {
    el.volume = desiredVolume; // 즉시 되돌림
  }
});
```

핵심 안전장치는 **epsilon 비교**다. `el.volume = desiredVolume` 대입 자체도 다시 `volumechange`를 발생시키지만, 그 재귀 호출 시점엔 이미 값이 목표와 같아져 있으므로 조건이 거짓이 되어 재할당이 멈춘다("한 번 튕기고 멈추는" 구조라 무한루프가 아님). epsilon은 부동소수점 오차(예: `50/100`을 사이트가 내부적으로 `0.499999`로 반올림해 저장했다가 복원하는 경우) 때문에 필요하다. **한계**: 위에서 설명한 GainNode 기반 사이트에는 안 먹힐 수 있음.

### 대응 패턴 2 — 탭 오디오 스트림 자체를 가로채기 (강함, 원리적으로 우회 불가)
`chrome.tabCapture`로 탭의 오디오 스트림 자체를 캡처해서, Web Audio API로 그 스트림 위에 직접 `GainNode`를 하나 더 얹는 방식. 사이트가 `.volume`을 쓰든 자체 `GainNode`를 쓰든 상관없이, **최종 출력 직전 단계에서 한 번 더 gain을 곱하기 때문에** 원리적으로 우회가 불가능하다. 실제 상용/오픈소스 볼륨 조절 확장(Tab-Volume, volume-manager 등)이 이 방식을 쓴다. 대가는 구현 복잡도 — MV3는 서비스 워커에 DOM이 없어서 오디오 그래프를 구성하려면 `chrome.offscreen`으로 숨겨진 문서를 따로 만들어야 하고, 탭이 실제로 오디오를 재생 중이어야 캡처가 가능하다는 제약이 있다.

### 참고: 없는 것들
- `chrome.tabs.update({muted: true/false})`는 **mute/unmute만** 가능하고, 세밀한 볼륨(%) 조절 API는 Extensions API에 따로 없다.
- `MediaSession API`는 play/pause/seek/트랙 이동 액션 핸들러만 제공하고 **볼륨 제어 액션이 없다**.

### 실전 판단 기준
"패턴 1(감시자)로 볼륨을 되돌렸는데도 실제 들리는 소리가 안 바뀐다"면 그 사이트가 GainNode 기반일 가능성이 높다는 신호 — 이때 패턴 2(tabCapture + GainNode)로 전환을 검토한다. 처음부터 패턴 2로 시작하기엔 구현 비용이 크므로, 패턴 1을 먼저 시도하고 실패 시 단계적으로 올라가는 게 합리적.

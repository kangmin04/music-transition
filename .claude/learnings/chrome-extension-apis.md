# Chrome 확장 프로그램 API

## 2026-08-28 — music-transition Chrome 확장(Manifest V3) 개발 중 정리

### `chrome.runtime.sendMessage` vs `chrome.tabs.sendMessage`
방향이 반대다. `chrome.runtime.sendMessage`는 지금 실행 중인 컨텍스트(팝업, 콘텐츠 스크립트)가 **이 확장의 background(service worker)로** 보내는 것 — 목적지를 지정하지 않고 항상 자기 확장의 백그라운드로만 간다. 반대로 `chrome.tabs.sendMessage(tabId, message)`는 background가 **특정 탭 하나를 콕 집어** 그 탭에 주입된 콘텐츠 스크립트로 보낼 때 쓴다. 대상 탭에 리스너(주입된 콘텐츠 스크립트)가 없으면 `"Could not establish connection. Receiving end does not exist."` 에러가 나므로, 탭이 새로고침되었거나 아직 스크립트가 안 들어간 경우를 항상 대비해 try/catch로 감싸야 한다.

### `chrome.runtime.onMessage` 리스너에서 비동기 응답 처리
```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  doAsyncWork().then(sendResponse);
  return true; // 이게 없으면 sendResponse가 나중에 불려도 무시된다
});
```
리스너 콜백이 동기적으로 끝나면 메시지 채널이 즉시 닫힌다. 응답을 `Promise`/`async` 등으로 나중에 보내야 한다면 콜백에서 **`return true`**를 해줘야 "비동기로 응답할 거니까 채널을 열어둬라"는 신호가 되고, 그래야 나중에 호출한 `sendResponse`가 실제로 상대방에게 전달된다.

### `sender` 파라미터로 발신자 검증
`onMessage` 리스너의 두 번째 인자 `sender`에는 `sender.tab.id` 등 발신 탭 정보가 들어있다. 여러 탭에 같은 콘텐츠 스크립트가 주입될 수 있는 구조라면, `sender.tab.id === 지정된탭ID` 같은 검증을 background에서 해줘야 "엉뚱한 탭에서 온 메시지"를 걸러낼 수 있다.

### `activeTab` vs `tabs` 권한
- `activeTab`: 사용자가 확장 아이콘/팝업을 조작한 **그 순간, 그 탭에 한해서만** 임시로 접근을 허용하는 최소 권한. `chrome.scripting.executeScript`로 스크립트를 주입할 때 이걸로 충분하다.
- `tabs`: 훨씬 강력한 상시 권한. 이게 있어야 `chrome.tabs.get`/`chrome.tabs.query`가 **모든 탭의 title/url을 항상** 돌려준다 — 없으면 host_permissions로 허용되지 않은 탭에 대해 이 필드들이 비어서 돌아온다.

`host_permissions`를 광범위하게 선언하지 않고도 "사용자가 지정한 임의의 탭"을 다루고 싶을 때, `activeTab` + 필요한 순간에만 `chrome.scripting.executeScript`로 주입하는 조합이 유용한 패턴이다.

### MV3 서비스 워커는 비영속적이다
Manifest V3의 background는 페이지가 아니라 **이벤트 기반으로 켜졌다 꺼지는 서비스 워커**다. 이벤트가 없으면 일정 시간 뒤 종료되고, 메시지가 오면 다시 깨어난다. 따라서 서비스 워커 안에서 `setInterval`로 주기적 작업을 걸어두면, 워커가 종료되는 순간 같이 사라진다 — 대신 **`chrome.alarms`** API(브라우저가 관리하는 타이머, 워커가 죽어도 예약이 유지되고 시간이 되면 워커를 다시 깨워줌)를 써야 한다.

### 그 외 알아두면 좋은 API
- `chrome.storage.local` vs `chrome.storage.sync`: `local`은 기기 간 동기화 안 됨(용량 제한 널널), `sync`는 로그인된 계정 기기 간 동기화됨(용량 제한 빡빡).
- `chrome.storage.onChanged.addListener((changes, area) => {...})`: storage 값이 바뀔 때 이벤트로 감지 — 팝업이 열려있는 동안 다른 컨텍스트(background)가 storage를 바꿔도 팝업 UI를 실시간으로 갱신하고 싶을 때 유용.
- `chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {...})`: 탭의 URL/제목/로딩 상태 변경 감지. 탭 제목(예: 재생 중인 곡 이름)이 바뀔 때마다 반응하고 싶을 때 씀.
- `chrome.tabs.onRemoved.addListener(tabId => {...})`: 탭이 닫힐 때 이벤트 — 지정해둔 탭이 사라지면 관련 상태를 정리하는 용도.
- `chrome.action`: 툴바 아이콘 관련 API. `setBadgeText`/`setIcon`/`setTitle`로 팝업을 안 열어도 아이콘에 상태를 표시할 수 있다.
- `chrome.runtime.onInstalled`: 확장이 설치/업데이트될 때 1회 실행 — 기본 설정값 초기화나 버전 마이그레이션 로직을 넣는 자리.
- `chrome.identity.launchWebAuthFlow(...)`: 확장이 client secret 없이 OAuth PKCE 플로우로 로그인 창을 띄우고 리다이렉트 콜백을 받을 때 쓰는 API. Chrome 확장은 secret을 안전하게 보관할 수 없으므로 서드파티 API(Spotify 등) 인증에 PKCE + 이 API 조합이 표준적.
- `chrome.tabCapture` + `chrome.offscreen`: 탭의 오디오 스트림 자체를 가로채려면 `tabCapture`가 필요한데, 캡처한 스트림을 Web Audio API로 처리(GainNode 등)하려면 DOM이 있는 컨텍스트가 필요하다. MV3 서비스 워커엔 DOM이 없으므로, `chrome.offscreen`으로 숨겨진 문서를 하나 만들어 그 안에서 오디오 그래프를 구성해야 한다.
- `chrome.commands`: manifest에 키보드 단축키를 등록해 특정 액션을 트리거하는 API.

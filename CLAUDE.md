# music-transition

강의를 듣다가 pause하면 배경음악이 자동으로 재생되고, 강의를 재개하면 음악이 자동으로 멈추는 자동화. 에어팟으로 공부할 때 필기 때문에 강의를 멈출 때마다 수동으로 폰을 꺼내 음악을 트는 번거로움을 없애는 게 목적.

## 현재 상태

이 저장소는 하나의 최종 앱이 아니라 **단계별로 구현 범위를 넓혀가는 여러 버전**을 담고 있음. 지금 동작하는 건 Phase 1(브라우저 탭 ↔ 탭)뿐이고, 나머지는 설계만 되어 있거나 보류 중.

| 단계 | 디렉토리 | 상태 |
|---|---|---|
| Phase 1: 브라우저 탭 ↔ 탭 | `chrome-extension/` | **동작함** — 압축해제 로드해서 바로 테스트 가능 |
| Phase 2: 폰의 Spotify 원격 재생 | `spotify/` | 보류 — background 로직만 있고 manifest/popup 없음 |
| Phase 3: 범용(모든 음악 앱, ntfy.sh 경유) | (미착수) | 계획만 있음 |

## Phase 1 — `chrome-extension/` (현재 작동 버전)

Manifest V3 확장. 사용자가 브라우저에서 "강의 탭"과 "음악 탭"(아무 사이트나 가능 — YouTube Music, Spotify Web Player, SoundCloud 등)을 지정하면, 강의 탭의 `<video>`가 pause/play될 때 음악 탭의 미디어 엘리먼트를 직접 제어함. 공식 API·로그인·구독 여부와 무관하게 동작하는 게 핵심 — 그냥 `<video>`/`<audio>` DOM 엘리먼트를 컨트롤할 뿐.

```
chrome-extension/
├── manifest.json
├── background/service-worker.js   # 강의 탭 pause/play 메시지를 음악 탭 명령으로 라우팅
├── content/
│   ├── lecture-detector.js        # 강의 탭에 주입: <video> pause/play 이벤트 구독
│   └── music-controller.js        # 음악 탭에 주입: play/pause/volume 명령 수행
├── popup/                         # 탭 지정 버튼, 볼륨 슬라이더
└── docs/SETUP.md                  # 로컬 로드·테스트 방법
```

콘텐츠 스크립트는 manifest에 정적으로 선언하지 않고, 팝업에서 사용자가 탭을 지정하는 순간 `chrome.scripting.executeScript`로 그 탭에만 주입함(`activeTab` 권한 기반) — 광범위한 `host_permissions` 없이 동작하도록 한 설계 선택.

**테스트**: `chrome-extension/docs/SETUP.md` 참고. `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → `chrome-extension/` 폴더 선택.

**알려진 제약**: 음악 탭을 새로고침하면 주입된 스크립트가 날아가서 재지정 필요. 유튜브 광고로 인한 pause/play 오탐에 대한 디바운스 미구현. Spotify Web Player처럼 EME(DRM)가 관여하는 사이트는 `video.pause()/.play()`가 내부 UI와 어긋날 수 있음(필요시 버튼 클릭 시뮬레이션으로 보강 예정).

## Phase 2 — `spotify/` (보류 중)

강의는 여전히 Mac 브라우저에서 듣지만, 음악은 브라우저 탭이 아니라 **폰의 Spotify 앱**에서 AirPods로 재생하고 싶다는 요구사항에서 나온 버전. Spotify Web API의 `Transfer Playback`/`Play`/`Pause`/`Set Volume` 엔드포인트가 OAuth 토큰만으로 인터넷 어디서든 특정 기기(폰)를 원격 제어할 수 있다는 걸 이용함. Chrome 확장에는 client secret을 넣을 수 없으므로 PKCE 플로우(`chrome.identity.launchWebAuthFlow`) 사용.

재개 방법은 `spotify/README.md` 참고.

## Phase 3 — 범용 버전 (미착수)

Spotify 말고 Apple Music 등 다른 앱도 지원하려는 단계. Spotify 같은 원격 제어 API가 없는 앱은 **ntfy.sh**(무료 오픈소스 push 서비스) → 폰 알림 → Shortcuts 자동화 실행 경유로 계획 중. 단, 알림을 탭 없이 완전 자동 실행할 수 있는지는 아직 실측 검증이 안 됨(Pushcut의 핵심 기능인데 ntfy도 동일하게 되는지 불확실) — 착수 전에 먼저 프로토타입으로 확인 필요.

## 설계 히스토리 / 왜 이렇게 됐는가

원래는 macOS 네이티브 앱(Swift, 전역 키 감지 + AppleScript + MediaRemote)으로 설계했으나:
- macOS 15.4+가 MediaRemote 접근을 제한해 서드파티 앱이 시스템 NowPlaying 정보를 직접 못 읽음
- iPadOS는 다른 앱의 재생 상태를 백그라운드에서 감지할 공개 API가 아예 없음
- Mac App Store 배포 시 Spotify 같은 서드파티 앱을 AppleScript로 제어하려면 entitlement 심사 리스크가 있음

→ Chrome 확장 프로그램으로 전환. Xcode/Swift 불필요, 크로스플랫폼, 배포도 Chrome 웹스토어가 더 간단함. 그 안에서도 "브라우저 탭 제어"(Phase 1, 가장 간단·안정적) → "폰의 특정 앱 제어"(Phase 2, Spotify는 API로 깔끔하게 가능) → "폰의 임의 앱 제어"(Phase 3, ntfy.sh 경유, 검증 필요)로 난이도·범용성 순서를 나눠 단계적으로 구현 중.

## 개발 컨벤션

- 순수 JavaScript(Manifest V3), 빌드 도구 없음. `node --check <file>`로 문법만 확인.
- 각 backend(Spotify, 향후 ntfy)는 `music-backend.js`에 정의된 공통 인터페이스(`isConnected/connect/listDevices/play/pause`)를 따르도록 설계 — 나중에 백엔드를 스위칭 가능한 구조로 합치는 게 목표.
- 콘텐츠 스크립트는 `window.__xxxInstalled` 플래그로 중복 주입 방지.

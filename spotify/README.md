# Spotify 버전 (보류 중)

`chrome-extension/`(브라우저 탭 ↔ 탭 버전)을 먼저 완성하기로 하고 잠시 미뤄둔 코드입니다. 강의 탭이 pause되면 폰의 Spotify 앱을 Spotify Web API로 원격 재생시키는 버전으로, 아직 독립적으로 실행 가능한 확장 프로그램은 아닙니다(manifest.json, content script, popup 없음 — background 로직만 있음).

## 포함된 파일

- `background/config.js` — Spotify Developer Dashboard에서 발급받은 Client ID를 넣는 곳
- `background/backends/pkce.js` — OAuth PKCE 코드 검증자/챌린지 생성
- `background/backends/spotify-backend.js` — OAuth 로그인, 토큰 저장/갱신, 기기 목록 조회, 재생/일시정지/볼륨 API 호출
- `background/backends/music-backend.js` — 백엔드가 따라야 할 공통 인터페이스(계약)

## 재개할 때 할 일

계획 문서(`/Users/kangmin/.claude/plans/radiant-gliding-corbato.md`)의 M1 참고:
1. 이 폴더에 `manifest.json`(permissions: identity/storage, host_permissions: api.spotify.com·accounts.spotify.com) 추가
2. `background/service-worker.js` 작성 — `spotify-backend.js`를 불러와 강의 탭 pause/play 메시지를 Spotify API 호출로 라우팅(강의 탭 감지는 `chrome-extension/content/lecture-detector.js`를 그대로 재사용 가능)
3. `popup/`에 Spotify 연결 버튼, 기기 선택 UI 추가
4. Spotify Developer Dashboard에서 앱 등록 후 `background/config.js`의 `SPOTIFY_CLIENT_ID` 채우기

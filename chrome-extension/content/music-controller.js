// Injected on-demand into whichever tab the user picked as the "music" tab.
// Works with any site that plays audio/video through a standard HTML5
// media element (YouTube Music, Spotify Web Player, SoundCloud, etc.) —
// no site-specific API needed.
//
// Runs in the isolated world so it can use chrome.runtime messaging. The
// actual volume enforcement (which needs to run in the page's own JS world
// to have any effect on the page's own scripts — see music-volume-lock.js)
// is relayed there via postMessage.

// 격리된 월드에서 작동하는 파일. service-worker이 보내는 명령을 받아서, 실제 재생/정지를 실행하고, 볼륨 관련 명령은 MAIN world인 music-volumn.lock으로 넘겨줌. 

(() => {
  if (window.__musicControllerInstalled) {
    return;
  }
  window.__musicControllerInstalled = true;

  const VOLUME_LOCK_MSG_SOURCE = "music-transition-volume-lock";

  function findPrimaryMedia() {
    const els = [...document.querySelectorAll("video, audio")];
    return els.find((el) => !el.paused) ?? els[0] ?? null;
  }

  function postVolume(volume) {
    window.postMessage({ source: VOLUME_LOCK_MSG_SOURCE, volume }, "*");
  }

  // 강의가 멈춰 음악이 재생을 시작할 때 볼륨을 0에서 목표치까지 부드럽게
  // 올리기 위한 메시지. 실제 램프는 메인 월드(music-volume-lock.js)에서
  // 수행한다 — 그쪽만 페이지 자체 스크립트의 volume 덮어쓰기를 이길 수 있다.
  function postFadeInVolume(volume) {
    window.postMessage({ source: VOLUME_LOCK_MSG_SOURCE, fadeTo: volume }, "*");
  }


  // 명령 수신 리스너 
  /* 
    chrome.runtime.onMessage 로 백그라운드의 명령을 받음. 이 메서드로 인해 이 파일은 격리된 월드에 이썽야 함. 

  */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "MUSIC_COMMAND") {
      return;
    }
    const el = findPrimaryMedia();
    if (!el) {
      sendResponse({
        error: "이 탭에서 재생 가능한 미디어를 찾지 못했습니다.",
      });
      return;
    }
    if (message.action === "play") {
      if (typeof message.volume === "number") {
        postFadeInVolume(message.volume / 100);
      }
      el.play().catch((err) =>
        console.warn("[music-transition] play() failed", err),
      );
    } else if (message.action === "pause") {
      el.pause();
    } else if (message.action === "set_volume") {
      if (typeof message.volume === "number") {
        postVolume(message.volume / 100);
      }
    }
    sendResponse({ ok: true });
  });
})();

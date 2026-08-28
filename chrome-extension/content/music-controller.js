// Injected on-demand into whichever tab the user picked as the "music" tab.
// Works with any site that plays audio/video through a standard HTML5
// media element (YouTube Music, Spotify Web Player, SoundCloud, etc.) —
// no site-specific API needed.
//
// Runs in the isolated world so it can use chrome.runtime messaging. The
// actual volume enforcement (which needs to run in the page's own JS world
// to have any effect on the page's own scripts — see music-volume-lock.js)
// is relayed there via postMessage.
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
        postVolume(message.volume / 100);
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

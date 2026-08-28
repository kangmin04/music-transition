// Injected on-demand into whichever tab the user picked as the "music" tab.
// Works with any site that plays audio/video through a standard HTML5
// media element (YouTube Music, Spotify Web Player, SoundCloud, etc.) —
// no site-specific API needed.
(() => {
  if (window.__musicControllerInstalled) {
    return;
  }
  window.__musicControllerInstalled = true;

  function findPrimaryMedia() {
    const els = [...document.querySelectorAll("video, audio")];
    return els.find((el) => !el.paused) ?? els[0] ?? null;
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
        el.volume = message.volume / 100;
      }
      el.play().catch((err) =>
        console.warn("[music-transition] play() failed", err),
      );
    } else if (message.action === "pause") {
      el.pause();
    }
    sendResponse({ ok: true });
  });
})();

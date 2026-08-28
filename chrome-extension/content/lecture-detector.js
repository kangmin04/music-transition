// Injected on-demand (via chrome.scripting.executeScript) into the tab the
// user picked as the "lecture" tab. Watches the page's <video> element and
// reports pause/play to the background service worker.
(() => {
  if (window.__lectureDetectorInstalled) {
    return;
  }
  window.__lectureDetectorInstalled = true; // 같은 탭에 중복주입방지. 

  // Seeking/buffering and ad transitions can fire a brief pause→play blip on
  // the underlying <video> that isn't a real user pause. Debounce the pause
  // notification so those blips don't wake up the music tab.
  const PAUSE_DEBOUNCE_MS = 400;

  let videoEl = null;
  let pauseTimer = null;

  function findPrimaryVideo() {
    const vids = [...document.querySelectorAll("video")];
    return vids.find((v) => !v.paused) ?? vids[0] ?? null;
    // 페이지에서 모든 <video> 재생 중인 것 중  첫번째를 감시 대상으로 
  }

  function attach(el) {
    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }
    if (el === videoEl) {
      return;
    }
    videoEl = el;
    el.addEventListener("pause", () => {
      if (pauseTimer) {
        clearTimeout(pauseTimer);
      }
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        if (el.paused) {
          chrome.runtime.sendMessage({
            type: "LECTURE_STATE",
            playing: false,
          });
        }
      }, PAUSE_DEBOUNCE_MS);
    });
    el.addEventListener("play", () => {
      if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
      }
      chrome.runtime.sendMessage({ type: "LECTURE_STATE", playing: true });
    });
    chrome.runtime.sendMessage({ type: "LECTURE_STATE", playing: !el.paused });
  }


  const found = findPrimaryVideo();
  if (found) {
    attach(found);
  }

  new MutationObserver(() => {
    const next = findPrimaryVideo();
    if (next && next !== videoEl) {
      attach(next);
    }
  }).observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "LECTURE_VOLUME_COMMAND") {
      return;
    }
    if (videoEl && typeof message.volumePercent === "number") {
      videoEl.volume = message.volumePercent / 100;
    }
    sendResponse({ ok: true });
  });
})();

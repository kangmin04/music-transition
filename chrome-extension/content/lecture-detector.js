// Injected on-demand (via chrome.scripting.executeScript) into the tab the
// user picked as the "lecture" tab. Watches the page's <video> element and
// reports pause/play to the background service worker.
(() => {
  if (window.__lectureDetectorInstalled) {
    return;
  }
  window.__lectureDetectorInstalled = true;

  let videoEl = null;

  function findPrimaryVideo() {
    const vids = [...document.querySelectorAll("video")];
    return vids.find((v) => !v.paused) ?? vids[0] ?? null;
  }

  function attach(el) {
    if (el === videoEl) {
      return;
    }
    videoEl = el;
    el.addEventListener("pause", () =>
      chrome.runtime.sendMessage({ type: "LECTURE_STATE", playing: false }),
    );
    el.addEventListener("play", () =>
      chrome.runtime.sendMessage({ type: "LECTURE_STATE", playing: true }),
    );
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
})();

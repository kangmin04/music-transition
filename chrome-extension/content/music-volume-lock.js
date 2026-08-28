// Injected into the MAIN world (the page's own JS realm), not the
// extension's isolated world. This is required because Object.defineProperty
// overrides installed from an isolated-world content script only affect that
// world's own wrapper objects — they do NOT stop the page's own scripts
// (running in the main world) from writing to .volume on their own wrapper
// for the same underlying element. chrome.runtime is not available in the
// main world, so this talks to music-controller.js (isolated world) via
// window.postMessage instead of chrome.runtime messages.
(() => {
  if (window.__musicVolumeLockInstalled) {
    return;
  }
  window.__musicVolumeLockInstalled = true;

  const MSG_SOURCE = "music-transition-volume-lock";

  let mediaEl = null;
  let desiredVolume = null; // 0..1, null = no live target yet

  const nativeVolume = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "volume",
  );

  function lockVolume(el) {
    try {
      Object.defineProperty(el, "volume", {
        configurable: true,
        get() {
          return nativeVolume.get.call(el);
        },
        set(value) {
          nativeVolume.set.call(el, desiredVolume ?? value);
        },
      });
    } catch (err) {
      console.warn("[music-transition] volume lock failed", err);
    }
  }

  function findPrimaryMedia() {
    const els = [...document.querySelectorAll("video, audio")];
    return els.find((el) => !el.paused) ?? els[0] ?? null;
  }

  function attach(el) {
    if (el === mediaEl) {
      return;
    }
    mediaEl = el;
    lockVolume(el);
    if (desiredVolume !== null) {
      nativeVolume.set.call(el, desiredVolume);
    }
  }

  const found = findPrimaryMedia();
  if (found) {
    attach(found);
  }

  new MutationObserver(() => {
    const next = findPrimaryMedia();
    if (next && next !== mediaEl) {
      attach(next);
    }
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== MSG_SOURCE) {
      return;
    }
    if (typeof event.data.volume !== "number") {
      return;
    }
    desiredVolume = event.data.volume;
    const el = mediaEl ?? findPrimaryMedia();
    if (!el) {
      return;
    }
    if (el !== mediaEl) {
      attach(el);
    }
    nativeVolume.set.call(el, desiredVolume);
  });
})();

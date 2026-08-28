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

  const MSG_SOURCE = "music-transition-volume-lock";  // window.postmessage()로 보낼 때 music-column-lock이 보낸게 맞는지 확인용 
  const FADE_IN_DURATION_MS = 800; // 0.5~1초 범위 중간값

  let mediaEl = null;
  let desiredVolume = null; // 우리가 유지할 목표볼륨. 
  let fadeRafId = null;

  //object.getownpropertydescriptor : 객체의 속성을 반환함. 
  //1. 데이터 속성 : 그냥 값이 있는 평범한 속성 obj.name = 'kim'
  //2. 접근자 속성 : get, set이 있어서 값을 읽고 쓸 때 함수가 대신 실행되는 속성 
  // => nativevolumn엔 getter, setter 함수가 있다. ! 
  const nativeVolume = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "volume",
  );

  // console.debug('nativeVolumn 출력: ', nativeVolume)
  
  // Object.defineProperty(대상객체, 속성이름, 명세서): 그 객체에 새 속성을 정의하거나, 기존 속성을 명세서 내용으로 재정의함. 

  function lockVolume(el) {
    try {
      Object.defineProperty(el, "volume", {
        configurable: true,
        get() {
          return nativeVolume.get.call(el);
        },
        // set이 trick임! value를 무시하고 desiredvolume으로 저장함. 
        // call: 기존의 메서드처럼 호출되기위해 this를 강제로 지정 
        set(value) {
          nativeVolume.set.call(el, desiredVolume ?? value);
        },
      });
    } catch (err) {
      console.warn("[music-transition] volume lock failed", err);
    }
  }

  // 페에지의 모든 video, audio 태그를 읽어서 재생중인거 중 첫번째 고름 
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

  function cancelFade() {
    if (fadeRafId !== null) {
      cancelAnimationFrame(fadeRafId);
      fadeRafId = null;
    }
  }

  // 재생 시작 시 볼륨을 0에서 target까지 FADE_IN_DURATION_MS에 걸쳐 올린다.
  // 진행 중에는 desiredVolume을 매 프레임 갱신해서, 페이지 자체 스크립트가
  // 그 사이 .volume을 건드려도 lockVolume의 setter가 현재 fade 값으로
  // 되돌려놓게 한다.
  function fadeInTo(target) {
    cancelFade();
    const el = mediaEl ?? findPrimaryMedia();
    if (!el) {
      desiredVolume = target;
      return;
    }
    if (el !== mediaEl) {
      attach(el);
    }
    const startVolume = 0;
    const startTime = performance.now();
    desiredVolume = startVolume;
    nativeVolume.set.call(el, startVolume);

    function step(now) {
      const progress = Math.min(
        (now - startTime) / FADE_IN_DURATION_MS,
        1,
      );
      const value = startVolume + (target - startVolume) * progress;
      desiredVolume = value;
      nativeVolume.set.call(el, value);
      if (progress < 1) {
        fadeRafId = requestAnimationFrame(step);
      } else {
        fadeRafId = null;
      }
    }
    fadeRafId = requestAnimationFrame(step);
  }

  // 스크립트의 첫 시작 때 한번 엘리먼트를 찾아서 붙임. 
  //이후엔 하단의 mutationObserver로 감시하다가 곡이 바뀌어 새 엘리먼트가 생기면 다시 attach 함. 
  const found = findPrimaryMedia();
  if (found) {
    attach(found);
  }

  // MutationObserver: DOM이 바뀔때마다 알려줌 
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
    if (typeof event.data.fadeTo === "number") {
      fadeInTo(event.data.fadeTo);
      return;
    }
    if (typeof event.data.volume !== "number") {
      return;
    }
    cancelFade();
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

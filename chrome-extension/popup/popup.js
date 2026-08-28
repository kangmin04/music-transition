const $ = (id) => document.getElementById(id);

async function send(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (res?.error) {
    throw new Error(res.error);
  }
  return res;
}

function showError(err) {
  $("errorBox").textContent = err ? String(err.message ?? err) : "";
}

async function injectAndAssign(role) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("현재 탭을 찾을 수 없습니다.");
  }

  if (role === "lecture") {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/lecture-detector.js"],
    });
  } else {
    // music-volume-lock.js must run in the page's own JS world (not the
    // extension's isolated world) to actually override how the page reads
    // and writes its own <video>/<audio>.volume — see that file for why.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/music-volume-lock.js"],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/music-controller.js"],
    });
  }

  const message =
    role === "lecture"
      ? { type: "SET_LECTURE_TAB", tabId: tab.id, tabTitle: tab.title }
      : { type: "SET_MUSIC_TAB", tabId: tab.id, tabTitle: tab.title };
  await send(message);
}

function setBadge(el, tabId) {
  const assigned = Boolean(tabId);
  el.textContent = assigned ? "지정됨" : "지정 안 됨";
  el.classList.toggle("badge-on", assigned);
  el.classList.toggle("badge-off", !assigned);
}

// Shows the assigned tab's live title (lecture name / song name) in place of
// the instructional hint text, falling back to the stored title if the tab
// can't be reached right now.
function setHint(el, title) {
  if (title) {
    el.textContent = title;
    el.title = title;
    el.classList.add("tab-title");
  } else {
    el.textContent = el.dataset.default;
    el.title = "";
    el.classList.remove("tab-title");
  }
}

async function getLiveTabTitle(tabId, fallbackTitle) {
  if (!tabId) {
    return null;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || fallbackTitle || null;
  } catch {
    return fallbackTitle || null;
  }
}

async function refreshStatus() {
  const { settings } = await send({ type: "GET_SETTINGS" });
  setBadge($("lectureTabStatus"), settings.lectureTabId);
  setBadge($("musicTabStatus"), settings.musicTabId);
  setHint(
    $("lectureHint"),
    await getLiveTabTitle(settings.lectureTabId, settings.lectureTabTitle),
  );
  setHint(
    $("musicHint"),
    await getLiveTabTitle(settings.musicTabId, settings.musicTabTitle),
  );
  $("lectureVolumeSlider").value = settings.lectureVolumePercent;
  $("lectureVolumeValue").textContent = settings.lectureVolumePercent;
  $("musicVolumeSlider").value = settings.musicVolumePercent;
  $("musicVolumeValue").textContent = settings.musicVolumePercent;
}

$("setLectureTabBtn").addEventListener("click", async () => {
  try {
    showError(null);
    await injectAndAssign("lecture");
    await refreshStatus();
  } catch (err) {
    showError(err);
  }
});

$("setMusicTabBtn").addEventListener("click", async () => {
  try {
    showError(null);
    await injectAndAssign("music");
    await refreshStatus();
  } catch (err) {
    showError(err);
  }
});

$("lectureVolumeSlider").addEventListener("input", async (e) => {
  $("lectureVolumeValue").textContent = e.target.value;
  try {
    await send({
      type: "SET_LECTURE_VOLUME",
      volumePercent: Number(e.target.value),
    });
  } catch (err) {
    showError(err);
  }
});

$("musicVolumeSlider").addEventListener("input", async (e) => {
  $("musicVolumeValue").textContent = e.target.value;
  try {
    await send({
      type: "SET_MUSIC_VOLUME",
      volumePercent: Number(e.target.value),
    });
  } catch (err) {
    showError(err);
  }
});

refreshStatus().catch(showError);

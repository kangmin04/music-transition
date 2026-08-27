const $ = (id) => document.getElementById(id);

async function send(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (res?.error) throw new Error(res.error);
  return res;
}

function showError(err) {
  $("errorBox").textContent = err ? String(err.message ?? err) : "";
}

async function injectAndAssign(role) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("현재 탭을 찾을 수 없습니다.");

  const file = role === "lecture" ? "content/lecture-detector.js" : "content/music-controller.js";
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });

  const message =
    role === "lecture"
      ? { type: "SET_LECTURE_TAB", tabId: tab.id, tabTitle: tab.title }
      : { type: "SET_MUSIC_TAB", tabId: tab.id, tabTitle: tab.title };
  await send(message);
}

async function refreshStatus() {
  const { settings } = await send({ type: "GET_SETTINGS" });
  $("lectureTabStatus").textContent = settings.lectureTabId
    ? `강의 탭: ${settings.lectureTabTitle ?? settings.lectureTabId}`
    : "지정 안 됨";
  $("musicTabStatus").textContent = settings.musicTabId
    ? `음악 탭: ${settings.musicTabTitle ?? settings.musicTabId}`
    : "지정 안 됨";
  $("volumeSlider").value = settings.volumePercent;
  $("volumeValue").textContent = settings.volumePercent;
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

$("volumeSlider").addEventListener("input", (e) => {
  $("volumeValue").textContent = e.target.value;
});

$("volumeSlider").addEventListener("change", async (e) => {
  try {
    await send({ type: "SET_VOLUME", volumePercent: Number(e.target.value) });
  } catch (err) {
    showError(err);
  }
});

refreshStatus().catch(showError);

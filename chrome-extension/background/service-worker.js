// Phase 1: browser-tab ↔ browser-tab version. Any site with a standard
// <video>/<audio> element can be the "music" tab — no vendor API needed.
// (The Spotify-remote-device version lives in backends/spotify-backend.js
// and will be wired back in as an alternate mode in a later phase.)

// 상태를 갖고있는 유일한 파일. 
const DEFAULT_SETTINGS = {
  lectureTabId: null,
  lectureTabTitle: null,
  musicTabId: null,
  musicTabTitle: null,
  lectureVolumePercent: 100,
  musicVolumePercent: 20,
  // 사용자가 "학습 종료"를 명시적으로 눌렀는지 여부. 켜져 있는 동안은
  // 강의 탭에서 오는 pause 신호가 음악 탭을 재생시키지 않는다 —
  // 필기 때문에 잠깐 멈춘 것과 실제로 공부를 끝낸 것을 구분하는 유일한 신호.
  realStopActive: false,
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse) // handleMessage()의 결과를 sendResponse로 보냄. 
    .catch((err) => {
      console.error("[music-transition]", message?.type, err);
      sendResponse({ error: err.message });
    });
  return true; // keep the message channel open for the async response
});

// Shared by the popup's "학습 종료" button and the real-stop keyboard
// shortcut: stop the music tab immediately and mark the session as a real
// stop so subsequent pause signals from the lecture tab are ignored until
// the lecture actually resumes.
async function realStop() {
  // 1. 학습 종료 상태로 저장
  const settings = await updateSettings({ realStopActive: true });
  if (settings.musicTabId) {
    try {
      // 2. 음악 탭이 지정돼 있으면 즉시 정지 명령을 보냄
      await chrome.tabs.sendMessage(settings.musicTabId, {
        type: "MUSIC_COMMAND",
        action: "pause",
      });
    } catch (err) {
      console.warn(
        "[music-transition] music tab not reachable:",
        err.message,
      );
    }
  }
  // 3. 갱신된 설정을 반환
  return settings;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "real-stop") {
    realStop();
  }
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case "SET_LECTURE_TAB":
      return {
        settings: await updateSettings({
          lectureTabId: message.tabId,
          lectureTabTitle: message.tabTitle,
          realStopActive: false,
        }),
      };

    case "SET_MUSIC_TAB":
      return {
        settings: await updateSettings({
          musicTabId: message.tabId,
          musicTabTitle: message.tabTitle,
          realStopActive: false,
        }),
      };

    case "REAL_STOP":
      return { settings: await realStop() };

    case "SET_LECTURE_VOLUME": {
      const settings = await updateSettings({
        lectureVolumePercent: message.volumePercent,
      });
      if (settings.lectureTabId) {
        try {
          await chrome.tabs.sendMessage(settings.lectureTabId, {
            type: "LECTURE_VOLUME_COMMAND",
            volumePercent: settings.lectureVolumePercent,
          });
        } catch (err) {
          console.warn(
            "[music-transition] lecture tab not reachable:",
            err.message,
          );
        }
      }
      return { settings };
    }

    case "SET_MUSIC_VOLUME": {
      const settings = await updateSettings({
        musicVolumePercent: message.volumePercent,
      });
      if (settings.musicTabId) {
        try {
          await chrome.tabs.sendMessage(settings.musicTabId, {
            type: "MUSIC_COMMAND",
            action: "set_volume",
            volume: settings.musicVolumePercent,
          });
        } catch (err) {
          console.warn(
            "[music-transition] music tab not reachable:",
            err.message,
          );
        }
      }
      return { settings };
    }

    case "GET_SETTINGS":
      return { settings: await getSettings() };

    case "LECTURE_STATE": {
      // 1. 보낸 탭이 실제로 지정된 강의 탭인지, 음악 탭이 지정돼 있는지 확인
      let settings = await getSettings();
      if (sender.tab?.id !== settings.lectureTabId || !settings.musicTabId) {
        return {};
      }

      // 2. 학습 종료 상태에서 오는 멈춤 신호는 무시함
      if (!message.playing && settings.realStopActive) {
        // Real stop is in effect — ignore repeated pause signals (e.g. an
        // ad-transition DOM change re-attaching the lecture video) so the
        // music doesn't get woken back up.
        return {};
      }

      // 3. 학습 종료 상태였는데 강의가 다시 재생되면 종료 상태를 해제함
      if (message.playing && settings.realStopActive) {
        // Lecture actually resumed — clear real-stop so the next pause
        // behaves normally again.
        settings = await updateSettings({ realStopActive: false });
      }

      // 4. 강의 상태(재생/멈춤)에 따라 음악 탭에 보낼 명령을 구성함
      const command = message.playing
        ? { type: "MUSIC_COMMAND", action: "pause" }
        : {
            type: "MUSIC_COMMAND",
            action: "play",
            volume: settings.musicVolumePercent,
          };

      try {
        // 5. 구성한 명령을 음악 탭으로 전송함
        await chrome.tabs.sendMessage(settings.musicTabId, command);
      } catch (err) {
        // Most common cause: the music tab was reloaded/navigated away and
        // lost the injected content script. Surfaced in the console rather
        // than thrown, since there's no popup open to show it to.
        console.warn(
          "[music-transition] music tab not reachable:",
          err.message,
        );
      }
      return {};
    }

    default:
      return { error: `unknown message type: ${message.type}` };
  }
}

// Drop stale tab mappings so the popup doesn't point at a closed tab.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const settings = await getSettings();
  const patch = {};
  if (settings.lectureTabId === tabId) {
    patch.lectureTabId = null;
    patch.lectureTabTitle = null;
  }
  if (settings.musicTabId === tabId) {
    patch.musicTabId = null;
    patch.musicTabTitle = null;
  }
  if (Object.keys(patch).length) {
    await updateSettings(patch);
  }
});

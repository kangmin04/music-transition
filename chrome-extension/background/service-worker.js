// Phase 1: browser-tab ↔ browser-tab version. Any site with a standard
// <video>/<audio> element can be the "music" tab — no vendor API needed.
// (The Spotify-remote-device version lives in backends/spotify-backend.js
// and will be wired back in as an alternate mode in a later phase.)

const DEFAULT_SETTINGS = {
  lectureTabId: null,
  lectureTabTitle: null,
  musicTabId: null,
  musicTabTitle: null,
  volumePercent: 50,
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
    .then(sendResponse)
    .catch((err) => {
      console.error("[music-transition]", message?.type, err);
      sendResponse({ error: err.message });
    });
  return true; // keep the message channel open for the async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case "SET_LECTURE_TAB":
      return {
        settings: await updateSettings({
          lectureTabId: message.tabId,
          lectureTabTitle: message.tabTitle,
        }),
      };

    case "SET_MUSIC_TAB":
      return {
        settings: await updateSettings({
          musicTabId: message.tabId,
          musicTabTitle: message.tabTitle,
        }),
      };

    case "SET_VOLUME":
      return {
        settings: await updateSettings({
          volumePercent: message.volumePercent,
        }),
      };

    case "GET_SETTINGS":
      return { settings: await getSettings() };

    case "LECTURE_STATE": {
      const settings = await getSettings();
      if (sender.tab?.id !== settings.lectureTabId || !settings.musicTabId) {
        return {};
      }

      const command = message.playing
        ? { type: "MUSIC_COMMAND", action: "pause" }
        : {
            type: "MUSIC_COMMAND",
            action: "play",
            volume: settings.volumePercent,
          };

      try {
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

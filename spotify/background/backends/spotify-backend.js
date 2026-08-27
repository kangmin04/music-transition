import { SPOTIFY_CLIENT_ID } from "../config.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = ["user-modify-playback-state", "user-read-playback-state"].join(" ");

const STORAGE_KEY = "spotifyAuth"; // { accessToken, refreshToken, expiresAt }

async function getStoredAuth() {
  const { [STORAGE_KEY]: auth } = await chrome.storage.local.get(STORAGE_KEY);
  return auth ?? null;
}

async function setStoredAuth(auth) {
  await chrome.storage.local.set({ [STORAGE_KEY]: auth });
}

/** @type {import("./music-backend.js").MusicBackend} */
export const spotifyBackend = {
  async isConnected() {
    const auth = await getStoredAuth();
    return Boolean(auth?.refreshToken);
  },

  async connect() {
    const redirectUri = chrome.identity.getRedirectURL();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const authUrl = new URL(AUTH_URL);
    authUrl.search = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      scope: SCOPES,
      state,
    }).toString();

    const redirectedTo = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    const responseUrl = new URL(redirectedTo);
    const returnedState = responseUrl.searchParams.get("state");
    const code = responseUrl.searchParams.get("code");
    if (!code || returnedState !== state) {
      throw new Error("Spotify 인증에 실패했습니다 (state mismatch 또는 code 없음).");
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`토큰 발급 실패: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const token = await tokenRes.json();
    await setStoredAuth({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
  },

  async listDevices() {
    const res = await apiFetch("/me/player/devices", "GET");
    const body = await res.json();
    return (body.devices ?? []).map((d) => ({ id: d.id, name: d.name }));
  },

  async play(volumePercent) {
    const { deviceId } = await getSettings();
    if (!deviceId) throw new Error("대상 기기가 선택되지 않았습니다.");
    await apiFetch("/me/player", "PUT", { device_ids: [deviceId], play: true });
    await apiFetch(`/me/player/volume?volume_percent=${encodeURIComponent(volumePercent)}&device_id=${encodeURIComponent(deviceId)}`, "PUT");
  },

  async pause() {
    const { deviceId } = await getSettings();
    if (!deviceId) throw new Error("대상 기기가 선택되지 않았습니다.");
    await apiFetch(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, "PUT");
  },
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings ?? {};
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  });
  if (!res.ok) {
    throw new Error(`토큰 갱신 실패: ${res.status} ${await res.text()}`);
  }
  const token = await res.json();
  const auth = await getStoredAuth();
  const updated = {
    accessToken: token.access_token,
    // Spotify only returns a new refresh_token sometimes; keep the old one otherwise.
    refreshToken: token.refresh_token ?? auth?.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await setStoredAuth(updated);
  return updated;
}

async function ensureValidAccessToken() {
  let auth = await getStoredAuth();
  if (!auth?.refreshToken) {
    throw new Error("Spotify에 연결되어 있지 않습니다.");
  }
  if (!auth.accessToken || Date.now() >= auth.expiresAt - 30_000) {
    auth = await refreshAccessToken(auth.refreshToken);
  }
  return auth.accessToken;
}

async function apiFetch(path, method, body) {
  const accessToken = await ensureValidAccessToken();
  const doFetch = (token) =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(accessToken);
  if (res.status === 401) {
    const auth = await getStoredAuth();
    const refreshed = await refreshAccessToken(auth.refreshToken);
    res = await doFetch(refreshed.accessToken);
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Spotify API 오류: ${res.status} ${await res.text()}`);
  }
  return res;
}

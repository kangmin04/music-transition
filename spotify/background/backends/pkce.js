// PKCE helpers for the Spotify Authorization Code flow (no client secret needed,
// which matters because extension code is publicly inspectable).

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(bytes);
}

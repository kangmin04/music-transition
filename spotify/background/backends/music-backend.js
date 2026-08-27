/**
 * MusicBackend contract. Every backend (Spotify now, ntfy.sh later for
 * other apps) must implement this shape so service-worker.js can stay
 * backend-agnostic.
 *
 * @typedef {Object} MusicBackend
 * @property {() => Promise<boolean>} isConnected
 * @property {() => Promise<void>} connect
 * @property {() => Promise<Array<{id: string, name: string}>>} listDevices
 * @property {(volumePercent: number) => Promise<void>} play
 * @property {() => Promise<void>} pause
 */
export {};

// The app was called Musimore until 2026-10-29, and its saved settings lived under "musimore.*" storage keys. This boot
// script runs first in <head>, before anything reads storage, and moves those values to the "soundscape.*" keys once.
const KEYS = ["backdrop", "backdrop.params", "glass", "landing.params", "typeface"];

/** Inline script: copy each old "musimore.<key>" value to "soundscape.<key>" (unless already set), then remove the old key. */
export function legacyStorageBoot(): string {
  return `try{${JSON.stringify(KEYS)}.forEach(function(k){var o="musimore."+k,n="soundscape."+k,v=localStorage.getItem(o);if(v!==null){if(localStorage.getItem(n)===null)localStorage.setItem(n,v);localStorage.removeItem(o)}})}catch(e){}`;
}

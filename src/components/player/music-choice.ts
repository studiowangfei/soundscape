/**
 * Whether opening a song from the landing page (a click, so the browser lets sound start) switches its music on: it
 * always does, and it stays on from then on, song to song and back on the landing page, until the visitor switches it
 * off (a song page's pause, or the landing page's 🔊); the next song they open from the landing page switches it back on.
 * Music already on plays on; a song without a preview has nothing to start.
 */
export function startsOnOpen({ on, src }: { on: boolean; src: string | null }): boolean {
  return !on && src !== null;
}

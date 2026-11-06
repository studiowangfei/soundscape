/** When the landing wheel turns by itself (AutoRotate), as a pure function so it's tested in Node. */

/** ms: a step every 6 s with the music off; with it on, after 30 s of each preview; a list action pauses it for 30 s. */
export const AUTO = { quietMs: 6_000, musicMs: 30_000, pauseMs: 30_000 };

export type AutoState = { song: number; restedAt: number; music: boolean; paused: boolean; prevTime: number; steppedAt: number | null };

export type AutoInput = {
  now: number;
  /** The song the wheel rests on. */
  song: number;
  /** When the visitor last turned the wheel themselves (0: not yet). */
  userAt: number;
  /** The music is switched on. */
  music: boolean;
  /** The song has a preview, and the soundtrack is playing it now (it follows the background, a moment after the wheel). */
  hasPreview: boolean;
  playing: boolean;
  /** Where the soundtrack is in the preview, and how long that is, s. */
  time: number;
  duration: number;
  /** The page is out of sight. */
  hidden: boolean;
};

/**
 * One look at the clock (every 250 ms or so): whether to turn the wheel on a song now, and the state for the next look.
 * The wheel steps on once it has rested AUTO.quietMs on a song, or with the music on, once 30 s of the song's preview
 * has played (or all of a shorter one), so the songs change in time with it (a song without a preview waits
 * AUTO.musicMs; one whose preview doesn't play, 5 s more). Switching the music starts the wait over. The visitor turning the wheel stops it: once they've left it
 * alone for AUTO.pauseMs it steps on at once and carries on. Out of sight, it waits. One step per song (another try if
 * it hasn't arrived after 3 s).
 */
export function autoTick(prev: AutoState | null, i: AutoInput): { state: AutoState; step: boolean } {
  let s = prev ?? { song: i.song, restedAt: i.now, music: i.music, paused: false, prevTime: i.time, steppedAt: null };
  if (i.song !== s.song) s = { ...s, song: i.song, restedAt: i.now, steppedAt: null };
  if (i.music !== s.music) s = { ...s, music: i.music, restedAt: i.now };
  const before = s.prevTime;
  s = { ...s, prevTime: i.time };
  if (i.hidden) return { state: { ...s, restedAt: i.now }, step: false };
  if (i.userAt > 0 && i.now - i.userAt < AUTO.pauseMs) return { state: { ...s, paused: true }, step: false };
  const resumed = s.paused;
  s = { ...s, paused: false };
  if (s.steppedAt !== null && i.now - s.steppedAt < 3000) return { state: s, step: false };
  const waited = i.now - s.restedAt;
  // 30 s of the preview heard (some are 90 s long), or all of a shorter one: at its end, or as it loops back round.
  const heard = Math.min(i.duration || Infinity, AUTO.musicMs / 1000);
  const ended = i.playing && (i.time >= heard - 0.35 || (before > heard - 1.5 && i.time < before - 1));
  // A preview that never starts or stalls (offline, a failed load) isn't waited for for ever.
  const due = resumed || (!i.music || !i.hasPreview ? waited >= (i.music ? AUTO.musicMs : AUTO.quietMs) : ended || waited >= AUTO.musicMs + 5000);
  return due ? { state: { ...s, steppedAt: i.now }, step: true } : { state: s, step: false };
}

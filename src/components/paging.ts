/**
 * Turning a song page to the next or previous song (the landing wheel's order) by a vertical gesture: a finger's swipe,
 * a trackpad swipe or mouse wheel notch, ↑ / ↓ (docs/plans/2026-11-17-song-paging-design.md). Next is below, as on
 * the landing wheel: swipe up, scroll down or ↓ for the next song. Each rule here decides one gesture, from what the
 * page saw of it (useSongTurn wires them to the window); pure, so it's tested in Node. And on the fog, whether a finger
 * wipes it or swipes (touchIntent).
 */
import { HOLD_MS } from "./gesture";

/** 1: the next song; -1: the previous one. */
export type PageDir = 1 | -1;

/** A finger's swipe, from touchstart to touchend. */
export type TouchSwipe = {
  /** How far it went (px; up is negative), and in how long (ms). */
  dx: number;
  dy: number;
  ms: number;
  /** The fog took the touch: a press held still, then a wipe (backdrops/variants.tsx). */
  fog: boolean;
  /** A second finger came down (a pinch). */
  multi: boolean;
  /** The page scrolled during it. */
  scrolled: boolean;
  /** Whether the page was at its top, at its bottom, as the finger came down (both, on a page that doesn't scroll). */
  atTop: boolean;
  atBottom: boolean;
  /** Pinch-zoomed in: a finger pans the zoomed-in view. */
  zoomed: boolean;
  /** It started on the card row, which is swiped sideways only (a trackpad's swipe over it doesn't turn either: useSongTurn). */
  onRow: boolean;
};

/**
 * A finger's swipe turns the song once it has gone this far up or down (px), this much more up or down than sideways
 * (the card row's swipes are its own), and quickly (ms), or slowly but a long way.
 */
export const TOUCH_TURN = { minPx: 40, ratio: 1.5, quickMs: 450, longPx: 140 };

export function touchTurn(s: TouchSwipe): PageDir | 0 {
  if (s.fog || s.multi || s.zoomed || s.scrolled || s.onRow) return 0;
  const dist = Math.abs(s.dy);
  if (dist < TOUCH_TURN.minPx || dist < Math.abs(s.dx) * TOUCH_TURN.ratio) return 0;
  if (s.ms > TOUCH_TURN.quickMs && dist < TOUCH_TURN.longPx) return 0;
  const dir: PageDir = s.dy < 0 ? 1 : -1;
  // On a page that scrolls, only from the end the swipe goes past (up past the bottom: the next song).
  return (dir === 1 ? s.atBottom : s.atTop) ? dir : 0;
}

/** Where a finger was on the fog, and when (ms), from where it pressed. */
export type TouchPoint = { t: number; x: number; y: number };

/**
 * A finger moving off the fog swipes if it's thrown: once this far (px) from where it pressed, it's judged by its speed
 * over its last `ms`: at least `flick` px/ms is a swipe. (A flick is still speeding up by then, so it's judged by how
 * fast it's going now, not on average.)
 */
export const WIPE_PACE = { px: 24, ms: 32, flick: 0.45 };
/** A frame (ms): a finger sends a move a frame, while it moves. */
const FRAME = 16;

/**
 * On a song page that fits the window, whether a finger on the fog wipes it or swipes (a swipe turns the song, which
 * touchTurn decides): a finger resting, rubbing or dragging along wipes; one thrown off swipes, even after a rest. Held
 * within WIPE_PACE.px of where it pressed for HOLD_MS (`now`, if no move came since), it wipes. null: not yet known.
 * (Where a drag has to stay the page's, a page that scrolls, the landing page's wheel, a press held still wipes and
 * any move is the page's: backdrops/variants.tsx.)
 */
export function touchIntent(path: TouchPoint[], now = path[path.length - 1].t): "wipe" | "swipe" | null {
  const first = path[0];
  const last = path[path.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) <= WIPE_PACE.px) return now - first.t >= HOLD_MS ? "wipe" : null;
  const i = Math.max(0, path.findLastIndex((p) => p.t <= last.t - WIPE_PACE.ms));
  const [from, next] = [path[i], path[i + 1]];
  // Still, it sends nothing: one quiet since `from` set off at most a frame before its next move (a rest, then a flick).
  const since = Math.max(from.t, next.t - FRAME);
  const speed = Math.hypot(last.x - from.x, last.y - from.y) / Math.max(1, last.t - since);
  return speed >= WIPE_PACE.flick ? "swipe" : "wipe";
}

/** A trackpad swipe turns the song once it has moved this many px… */
const TURN_PX = 50;
/** …within this many ms of its start: a slow drift, or a momentum's sparse tail, never does. */
const TURN_MS = 300;
/** Wheel events further apart than this belong to different swipes. */
const SWIPE_GAP = 180;
/** A swipe's first ms are all one push (its deltas grow). */
const PUSH_MS = 200;
/** A jump in the deltas starts a new swipe only once the last one's have faded under this share of their peak. */
const FADED = 0.35;
/** After a turn, the wheel doesn't turn again for this long (ms), whatever it does. */
const SETTLE_MS = 800;
/** Mouse wheel notches closer together than this (ms) are one spin. */
const SPIN_GAP = 250;

/**
 * Wheel events, read into turns: a trackpad swipe turns the song once, however long the momentum macOS adds to it; a
 * mouse wheel turns one song a spin (a notch, or a quick run of them: a song change is a whole new page, so a flick of
 * the wheel doesn't run on through several). A swipe that scrolls something (the page of a short window, the Tune panel)
 * never turns, momentum included, even once that reaches its end; the next swipe, starting at the end, does.
 *
 * A swipe that has turned (or scrolled) lasts until the wheel pauses: a jump back up in its deltas isn't read as a new
 * push, as the landing wheel reads it (landing/motion.ts), because it's as likely to be its own momentum starting up as
 * the fingers lift (a push easing off before they do: it turned two songs). Before a swipe has turned, such a jump
 * starts it afresh (fingers that rested, then pushed). And for SETTLE_MS after a turn nothing turns: the next song's
 * page arriving could hold the momentum back and hand it over in one go, after what looks like a pause. One for the
 * whole visit (useSongTurn): a swipe's momentum runs on into the next song's page, and mustn't turn that one too.
 */
export class WheelTurn {
  private s = { at: -Infinity, size: 0, travel: 0, done: false, trackpad: false, start: 0, peak: 0, turnedAt: -Infinity };

  /** A wheel event, as landing/wheel.ts wheelAction() read it; `scrolls`: something under the pointer scrolls with it. */
  wheel(deltaY: number, action: "scroll" | "notch", now: number, scrolls = false): PageDir | 0 {
    const s = this.s;
    const size = Math.abs(deltaY);
    if (size === 0) return 0;
    const gap = now - s.at;
    // A notch is a mouse wheel's, unless it comes in the middle of a trackpad swipe (a hard swipe's big deltas).
    const settling = now - s.turnedAt < SETTLE_MS;
    if (action === "notch" && !(s.trackpad && gap <= SWIPE_GAP)) {
      const spin = !s.trackpad && gap <= SPIN_GAP; // more of the same spin
      Object.assign(s, { at: now, size, travel: 0, done: true, trackpad: false, start: now, peak: size });
      return scrolls || spin || settling ? 0 : this.turned(deltaY, now);
    }
    const fresh = !s.done && size > s.size * 1.5 + 2 && now - s.start > PUSH_MS && s.size < s.peak * FADED;
    if (!s.trackpad || gap > SWIPE_GAP || fresh) Object.assign(s, { travel: 0, done: false, start: now, peak: 0 });
    Object.assign(s, { at: now, size, trackpad: true, peak: Math.max(s.peak, size) });
    if (scrolls || settling) s.done = true;
    if (s.done) return 0;
    s.travel += deltaY;
    if (Math.abs(s.travel) < TURN_PX || now - s.start > TURN_MS) return 0;
    s.done = true;
    return this.turned(s.travel, now);
  }

  private turned(delta: number, now: number): PageDir {
    this.s.turnedAt = now;
    return delta > 0 ? 1 : -1;
  }
}

/** A key press, as a KeyboardEvent has it. */
type Key = { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; repeat: boolean; defaultPrevented: boolean };

/**
 * ↓ turns to the next song and ↑ to the previous, one song a press (a held key doesn't run on through the songs). Not
 * with a modifier, while typing (or on the player's slider), with a card open (its own keys), or while the page can
 * still scroll that way (a short window: the arrows scroll it to its end first).
 */
export function keyTurn(e: Key, at: { typing: boolean; dialog: boolean; canScrollUp: boolean; canScrollDown: boolean }): PageDir | 0 {
  const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.defaultPrevented) return 0;
  if (at.typing || at.dialog || (dir === 1 ? at.canScrollDown : at.canScrollUp)) return 0;
  return dir;
}

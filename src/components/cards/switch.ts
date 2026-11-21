/**
 * Moving from an open card to the one beside it (arrow keys, a sideways swipe): the two sit side by side, a card-width
 * apart, and slide along together in one move, each fading by how far it is from the middle (so the one going out is
 * gone as it comes to rest beside the window's middle). Pure, so it's tested in Node; CardDetail runs it.
 */

/** How far along the next card waits (px): a card's width and the gap between the two. */
export const pagerStep = (width: number) => width + 24;

/** A card's opacity `x` px from the middle: solid there, gone a whole step along. */
export const pagerFade = (x: number, step: number) => Math.min(1, Math.max(0, 1 - Math.abs(x) / step));

/** How far a sideways swipe, a finger's or a trackpad's, must go (px) to move to the next card. */
export const SWIPE_DISTANCE = 80;
/** Wheel events further apart than this (ms) are different swipes; a mouse wheel's notches, different spins. */
const SWIPE_GAP = 180;
const SPIN_GAP = 250;
/** After moving on, nothing does for this long (ms): the next card arriving can hold a swipe's momentum back. */
const SETTLE_MS = 500;
/** At either end of the row, the card follows a quarter of the way. */
const GIVE = 0.25;

/**
 * A trackpad's sideways swipe (or a mouse wheel's sideways notch) over the open card, as a finger's swipe moves it: the
 * card follows the fingers (`drag`: where it goes, px; at either end of the row only a little), and once it has gone
 * SWIPE_DISTANCE moves on (`go`: 1, the next card), the next sliding in. A swipe that stops short is left where it
 * stopped: the card springs back once the wheel pauses. One card a swipe: after moving on, the rest of the swipe (its
 * momentum runs on into the next card) does nothing until the wheel pauses, and nothing moves on for SETTLE_MS. A
 * mouse wheel's notch moves on at once, one card a spin. One for the whole visit (CardDetail): the next card is a new
 * CardDetail, under the same swipe.
 */
export class SidewaysWheel {
  private s = { at: -Infinity, done: false, raw: 0, wentAt: -Infinity };

  /**
   * A wheel event: `dx` its deltaX (the fingers going left, positive with natural scrolling: on to the next card),
   * `notch` a mouse wheel's (landing/wheel.ts wheelAction), `x` where the card is now (px), `open` whether there's a
   * card that way. null: nothing to do.
   */
  wheel(dx: number, notch: boolean, now: number, x: number, open: (dir: -1 | 1) => boolean): { drag: number } | { go: -1 | 1 } | null {
    const s = this.s;
    if (dx === 0) return null;
    const gap = now - s.at;
    s.at = now;
    if (gap > (notch ? SPIN_GAP : SWIPE_GAP)) Object.assign(s, { done: false, raw: x });
    if (now - s.wentAt < SETTLE_MS) s.done = true;
    if (s.done) return null;
    if (notch) {
      s.done = true;
      const dir: -1 | 1 = dx > 0 ? 1 : -1;
      return open(dir) ? this.went(dir, now) : null;
    }
    s.raw -= dx;
    const dir: -1 | 1 = s.raw < 0 ? 1 : -1;
    if (!open(dir)) return { drag: s.raw * GIVE };
    if (Math.abs(s.raw) > SWIPE_DISTANCE) {
      s.done = true;
      return this.went(dir, now);
    }
    return { drag: s.raw };
  }

  private went(dir: -1 | 1, now: number) {
    this.s.wentAt = now;
    return { go: dir };
  }
}

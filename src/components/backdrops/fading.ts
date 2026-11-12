/**
 * The faintest a fading mark (a wipe, a run's trail) counts as still showing, in canvas alpha (0–255): about 1%, too
 * faint to see. A mark never fades all the way to 0 on its own: 8-bit alpha faded a quarter at a time sticks at 1 (Chrome
 * and Safari alike), and the layer only clears once its newest mark has faded, so "any alpha" would keep long-gone wipes
 * and trails counting for as long as new ones keep coming.
 */
export const SHOWS_FROM = 3;

/**
 * Whether a fading layer shows a mark within `r` of fog px (x, y), from `px`: the RGBA pixels of a w×h patch of it
 * whose top left is fog px (x0, y0), drawn at strength `k` (FadingLayer draws its aged marks partway into the next step).
 */
export function marksNear(px: ArrayLike<number>, w: number, h: number, x0: number, y0: number, x: number, y: number, r: number, k = 1) {
  const min = SHOWS_FROM / Math.max(k, 0.01);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (px[(j * w + i) * 4 + 3] >= min && Math.hypot(x0 + i + 0.5 - x, y0 + j + 0.5 - y) <= r) return true;
  return false;
}

/**
 * The landing page's song wheel, as pure functions (no DOM, so they're tested in Node): its measurements, how a row
 * looks at a given offset from the centre (on a drum, like the iOS inline picker), the loop, and how a release
 * settles. Positions and offsets are in rows; velocities in rows per second.
 */
import { normalize, searchEntries, type Searchable } from "../../content/search";

/** Tunable in the landing Tune panel's Wheel group (params.ts WHEEL_PARAMS uses the same keys). */
export type WheelSettings = {
  /** Drum diameter, as a multiple of the window height. */
  drum: number;
  /** Row spacing, as a multiple of the text size. */
  spacing: number;
  /** How much smaller each row away from the centre is. */
  falloff: number;
  /** How much of the window's width the longest title spans at the centre. */
  longest: number;
  /** Opacity of the songs right next to the centred one (further ones fade further). */
  dim: number;
};

/** Rows further than this from the centre are never drawn. */
const MAX_OFFSET = 12;

/**
 * The wheel's measurements for this window: the centre text size (so the longest title, `longestAt100` px wide at
 * 100 px, plus the bar round it, `barEm` em and `barPx` px wider, spans `longest` of the width; every title uses it),
 * the row spacing, and the drum's radius and the angle between rows on it.
 */
export function wheelGeometry(s: WheelSettings, view: { w: number; h: number }, longestAt100: number, barEm = 0, barPx = 0) {
  const centerSize = Math.max(1, s.longest * view.w - barPx) / Math.max(1e-6, longestAt100 / 100 + barEm);
  const pitch = s.spacing * centerSize;
  const radius = (s.drum * view.h) / 2;
  return { centerSize, pitch, radius, stepDeg: (pitch / radius) * (180 / Math.PI) };
}

/**
 * A row `offset` rows from the centre: its tilt on the drum, its size (1 at the centre), its opacity, and whether it
 * shows. Opacity sets the focused song apart: full at the centre, `dim` one row out (smoothly in between, so a song
 * brightens as it turns in), and fading further towards the drum's edges.
 */
export function rowLook(offset: number, look: { stepDeg: number; falloff: number; dim: number }) {
  const angleDeg = offset * look.stepDeg;
  const near = Math.max(0, 1 - Math.abs(offset));
  return {
    angleDeg,
    scale: Math.max(0.35, 1 - look.falloff * Math.abs(offset)),
    opacity: Math.max(0, 1 - Math.abs(angleDeg) / 95) * (look.dim + (1 - look.dim) * near),
    visible: Math.abs(angleDeg) < 90 && Math.abs(offset) <= MAX_OFFSET,
  };
}

/** The song a wheel row shows: the list loops, so rows past either end are songs from the other end. */
export function wrap(i: number, n: number) {
  return ((i % n) + n) % n;
}

/** How many rows apart `a` and `b` are the short way round a loop of `n` (fractional rows allowed). */
function loopDistance(a: number, b: number, n: number) {
  const d = (((b - a) % n) + n) % n;
  return Math.min(d, n - d);
}

/**
 * Whether the wheel is travelling through several songs at once (the search bar fades meanwhile): it's headed two or
 * more songs from `from`, the row it set off from, or a drag has carried it more than a song and a half. A single step
 * never counts. `to` is where it's going, `pos` where it is; rows loop round `n` songs.
 */
export function travelling(from: number, to: number, pos: number, n: number, dragging: boolean) {
  return loopDistance(from, to, n) >= 2 || (dragging && loopDistance(from, pos, n) > 1.5);
}

/** The row showing song `i` that's nearest to `pos`: going to a song takes the short way round the loop. */
export function nearestEquivalent(pos: number, i: number, n: number) {
  const base = Math.round(pos);
  let d = wrap(i - base, n);
  if (d > n / 2) d -= n;
  return base + d;
}

/** Where a released drag settles, like turning a page: at most one row past where the finger left it. */
export function flickTarget(pos: number, vel: number) {
  return Math.round(pos + Math.sign(vel) * Math.min(0.75, Math.abs(vel) * 0.1));
}

/** One step of a critically damped spring towards `target` (`dt` in seconds). */
export function springStep(pos: number, vel: number, target: number, dt: number) {
  const v = vel + (170 * (target - pos) - 26 * vel) * dt;
  return { pos: pos + v * dt, vel: v };
}

/** The wheel position of the first song matching `query`, or null (an empty or punctuation-only query, or no match). */
export function matchIndex<T extends Searchable>(songs: T[], query: string): number | null {
  if (!normalize(query)) return null;
  const first = searchEntries(songs, query)[0];
  return first ? songs.indexOf(first) : null;
}

/** The rows whose covers to prefetch: two either side of the focused one, round the loop. */
export function prefetchRows(focused: number, count: number): number[] {
  return [...new Set([-2, -1, 1, 2].map((d) => wrap(focused + d, count)))].filter((i) => i !== focused);
}

/**
 * What a wheel event does: Ctrl+wheel and trackpad pinches zoom the page (ignored here); small pixel deltas are a
 * trackpad (followed continuously); anything else is a mouse-wheel notch (one row).
 */
export function wheelAction(e: { deltaMode: number; deltaY: number; ctrlKey: boolean }): "ignore" | "scroll" | "notch" {
  if (e.ctrlKey || e.deltaY === 0) return "ignore";
  return e.deltaMode === 0 && Math.abs(e.deltaY) < 50 ? "scroll" : "notch";
}

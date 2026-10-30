/**
 * Geometry of the Fog style's self-running drops (no DOM, so it can be tested): a drop's path down the glass, its
 * stop-and-go timing, and the droplets it takes along. Positions are fog-canvas px.
 */

/** The trail is this fraction of the drop's radius wide on each side, with a soft edge blurred by `TRAIL_SOFT` × r. */
export const TRAIL_HALF = 0.75;
export const TRAIL_SOFT = 0.2;

/** How far a swept droplet's clearing reaches: all it covers when drawn, plus a margin for its anti-aliased edge. */
export const sweepRadii = (rx: number, ry: number) => [rx * 1.2 + 1, ry * 1.2 + 1] as const;

/** A drop running down the glass: where it started, its radius, how far and how long it runs. */
export type Drip = {
  x0: number;
  y0: number;
  r: number;
  len: number;
  start: number;
  dur: number;
  stops: number; // it moves in spurts: speed drops to zero this many times
  amp: number;
  freq: number;
  phase: number; // of its sideways wander
  rests: boolean; // stops on the glass and stays there as a drop; false: runs off the bottom edge
  e: number; // the droplet's own shape (fogDrops): elongation, outline wobble and its phase
  wob: number;
  ph: number;
  leftSpot: boolean; // has moved off the spot it sat on (which is then swept)
  absorb: PathDrop[]; // droplets in its path, by progress
  taken: number; // first of those not taken yet
};

export type PathDrop = { i: number; s: number; x: number; y: number; rx: number; ry: number };

/** A run of the droplet at (x0, y0) with body radius r and the given shape, so it starts out looking exactly like itself. */
export function newDrip(x0: number, y0: number, r: number, len: number, start: number, cover: number, rests = true, shape = { e: 1, wob: 0, ph: 0 }): Drip {
  const stops = 2 + Math.floor(Math.random() * 2);
  const dur = Math.min(rests ? 8000 : 11000, 2200 + (len / cover) * 12000); // a run off the bottom may take longer
  return { x0, y0, r, len, start, dur, stops, amp: r * (0.2 + Math.random() * 0.3), freq: 1 + Math.random() * 2, phase: Math.random() * 6.3, rests, ...shape, leftSpot: false, absorb: [], taken: 0 };
}

/** How much the drop stretches downward right now: none at rest, up to ~25% at the height of a spurt. */
export function dripStretch(d: Drip, now: number) {
  const u = Math.min(1, Math.max(0, (now - d.start) / d.dur));
  return 1 + 0.12 * (1 - Math.cos(2 * Math.PI * d.stops * u));
}

/** True for exactly one of every three calls, in a random place within each three (which runs go to the bottom). */
export function oneInThree() {
  let bag: boolean[] = [];
  return () => {
    if (!bag.length) {
      const k = Math.floor(Math.random() * 3);
      bag = [0, 1, 2].map((i) => i === k);
    }
    return bag.pop()!;
  };
}

/** Progress along the run, 0–1: u − sin(2πku)/2πk, so it surges and stops k times instead of sliding evenly. */
export function dripProgress(d: Drip, now: number) {
  const u = Math.min(1, Math.max(0, (now - d.start) / d.dur));
  const k = d.stops;
  return u - Math.sin(2 * Math.PI * k * u) / (2 * Math.PI * k);
}

/** The drop at progress s: nearly straight down with a gentle wander, shrinking a little as it wets the glass. */
export function dripAt(d: Drip, s: number) {
  const wander = (t: number) => Math.sin(t * d.freq * 2 * Math.PI + d.phase) * d.amp;
  return { x: d.x0 + wander(s) - wander(0), y: d.y0 + s * d.len, r: d.r * (1 - 0.2 * s) };
}

/**
 * The droplets in a run's path, which it takes along whole as it reaches them, by progress: every one whose drawn
 * extent reaches the cleared trail, soft edge included, so none is left cut in half. `drops` are fogDrops() (fractions
 * of `size`); `self` is the running drop's own index.
 */
export function pathDrops(d: Drip, drops: { i: number; x: number; y: number; rx: number; ry: number }[], size: number, self: number): PathDrop[] {
  return drops
    .flatMap((o) => {
      const s = (o.y * size - d.y0) / d.len;
      const at = dripAt(d, s);
      const touches = o.i !== self && s > -(d.r * 1.3) / d.len && s < 1 && Math.abs(o.x * size - at.x) < at.r * (TRAIL_HALF + 2 * TRAIL_SOFT) + o.rx * size;
      return touches ? [{ i: o.i, s, x: o.x * size, y: o.y * size, rx: o.rx * size, ry: o.ry * size }] : [];
    })
    .sort((a, b) => a.s - b.s);
}

/** Distance from (px, py) to the segment a–b. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The radii of all the droplet covered where it sat (wobble and elongation included), to sweep its spot once it leaves. */
export function dripSpot(d: Drip) {
  const rx = d.r * (1 + d.wob * 1.5);
  return [rx, rx * d.e] as const;
}

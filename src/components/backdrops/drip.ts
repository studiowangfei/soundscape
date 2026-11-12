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
  freq: number; // cycles over the run: at most half, so it leans one way once at most
  phase: number; // of its lean
  meander: Meander[]; // its gentle wander on top of the lean, as it finds its way down the glass
  rests: boolean; // stops on the glass and stays there as a drop; false: runs off the bottom edge
  e: number; // the droplet's own shape (fogDrops): elongation, outline wobble and its phase
  wob: number;
  ph: number;
  leftSpot: boolean; // has moved off the spot it sat on (which is then swept)
  absorb: PathDrop[]; // droplets in its path, by progress
  taken: number; // first of those not taken yet
};

/** `clear`: it touches the trail, so its spot is wiped clear with it; else it only overlaps the run's own spot (spotReach) and just goes. */
export type PathDrop = { i: number; s: number; x: number; y: number; rx: number; ry: number; clear: boolean };

/** A sideways wave along a run: `amp` px either way, every `wl` px down the glass (so long and short runs bend alike). */
export type Meander = { amp: number; wl: number; ph: number };

/**
 * A run's meander, for a drop of radius r: a long gentle wave and a shorter, smaller one at an unrelated wavelength on
 * it, so the path bends irregularly instead of weaving evenly. Slight: mostly straight down, never more than ~6° off.
 */
export function newMeander(r: number): Meander[] {
  const wl = r * (34 + Math.random() * 16);
  return [
    { amp: r * (0.18 + Math.random() * 0.08), wl, ph: Math.random() * 6.3 },
    { amp: r * (0.06 + Math.random() * 0.03), wl: wl * (0.35 + Math.random() * 0.1), ph: Math.random() * 6.3 },
  ];
}

/** How far down from the droplet's spot the trail narrows, in drop radii: from the drop's width to its own. */
export const NECK = 7;

/** A run of the droplet at (x0, y0) with body radius r and the given shape, so it starts out looking exactly like itself. */
export function newDrip(x0: number, y0: number, r: number, len: number, start: number, cover: number, rests = true, shape = { e: 1, wob: 0, ph: 0 }): Drip {
  const stops = 2 + Math.floor(Math.random() * 2);
  const dur = Math.min(rests ? 8000 : 11000, 2200 + (len / cover) * 12000); // a run off the bottom may take longer
  return { x0, y0, r, len, start, dur, stops, amp: r * (0.08 + Math.random() * 0.06), freq: 0.25 + Math.random() * 0.25, phase: Math.random() * 6.3, meander: newMeander(r), rests, ...shape, leftSpot: false, absorb: [], taken: 0 };
}

/**
 * A run asked for (the landing page's 💧), from the droplet at (x0, y0) all the way off the bottom: `len` takes it past
 * the bottom edge. Quicker than a run of its own, so it answers the tap: it pauses once on the way at most.
 */
export function newFall(x0: number, y0: number, r: number, len: number, start: number, cover: number, shape = { e: 1, wob: 0, ph: 0 }): Drip {
  return { ...newDrip(x0, y0, r, len, start, cover, false, shape), stops: 1 + Math.floor(Math.random() * 2), dur: 1400 + (len / cover) * 2000 };
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

/** The drop at progress s: down a slight lean and a gentle meander, shrinking a little as it wets the glass. */
export function dripAt(d: Drip, s: number) {
  const wander = (t: number) => Math.sin(t * d.freq * 2 * Math.PI + d.phase) * d.amp + d.meander.reduce((x, m) => x + Math.sin(((t * d.len) / m.wl) * 2 * Math.PI + m.ph) * m.amp, 0);
  return { x: d.x0 + wander(s) - wander(0), y: d.y0 + s * d.len, r: d.r * (1 - 0.2 * s) };
}

/**
 * Half the trail's width at progress s: its own (TRAIL_HALF of the drop), except near the top, where it starts as wide as
 * the drop was (dropOutline) and narrows smoothly over NECK radii, so the drop's spot and the trail read as one streak
 * with a rounded top, not a round hole with a line hanging from it.
 */
export function trailHalf(d: Drip, s: number) {
  const own = dripAt(d, s).r * TRAIL_HALF;
  const [spot] = dropOutline(d);
  const t = Math.min(1, Math.max(0, (s * d.len) / (NECK * d.r)));
  return own + Math.max(0, spot - own) * (0.5 + 0.5 * Math.cos(Math.PI * t));
}

/**
 * The droplet's own outline (dripSpot), 2% over: as far as the glass is wiped clear at the spot a run sets off from.
 * (Wiped as far as its whole spot (spotReach), a ring of clear glass showed round the drop as it set off.)
 */
export function dropOutline(d: Drip) {
  const [rx, ry] = dripSpot(d);
  return [rx * 1.02, ry * 1.02] as const;
}

/**
 * All the spot a droplet leaves covers (variants.tsx sweep), its faint rim and shadow too: taken off the glass when the
 * run leaves it, which only turns droplet-free mist (it looks like the rest), not clear.
 */
export function spotReach(d: Drip) {
  const [rx, ry] = dripSpot(d);
  const [a, b] = sweepRadii(rx, ry);
  const soft = 2 * Math.max(0.5, rx * 0.1);
  return [a + soft, b + soft] as const;
}

/** The top of the trail, above where the droplet sat: round, as the drop was (dropOutline). Points from the top down to its middle: [half-width, height above y0]. */
export function trailTop(d: Drip, steps = 8): [number, number][] {
  const [a, b] = dropOutline(d);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const v = 1 - i / steps;
    return [Math.sqrt(1 - v * v) * a, v * b];
  });
}

/**
 * The droplets in a run's path, which it takes along whole as it reaches them, by progress: every one whose drawn
 * extent reaches the cleared trail, soft edge included, so none is left cut in half. `drops` are fogDrops() (fractions
 * of `size`); `self` is the running drop's own index.
 */
export function pathDrops(d: Drip, drops: { i: number; x: number; y: number; rx: number; ry: number }[], size: number, self: number): PathDrop[] {
  const above = (dropOutline(d)[1] + 2 * TRAIL_SOFT * d.r) / d.len; // up to the top of the trail, soft edge included
  const [sa, sb] = spotReach(d);
  return drops
    .flatMap((o) => {
      if (o.i === self) return [];
      const s = (o.y * size - d.y0) / d.len;
      const at = dripAt(d, s);
      const clear = s > -above && s < 1 && Math.abs(o.x * size - at.x) < trailHalf(d, s) + 2 * TRAIL_SOFT * at.r + o.rx * size;
      // Overlapping the run's own spot, which is taken off the glass in full: it goes too, or it'd be left cut.
      const spot = ((o.x * size - d.x0) / (sa + o.rx * size)) ** 2 + ((o.y * size - d.y0) / (sb + o.ry * size)) ** 2 < 1;
      return clear || spot ? [{ i: o.i, s, x: o.x * size, y: o.y * size, rx: o.rx * size, ry: o.ry * size, clear }] : [];
    })
    .sort((a, b) => a.s - b.s);
}

/**
 * Whether a droplet of radius r at fog px (x, y) would sit in the way of a run still going: on its path so far or still
 * to come (its trail, `margin` px to spare), below where it set off. New droplets keep clear of them.
 */
export function inRunsWay(x: number, y: number, r: number, runs: Drip[], margin = 0) {
  return runs.some((d) => {
    const s = (y - d.y0) / d.len;
    if (s < -(d.r * 1.5 + r + margin) / d.len || s > 1) return false;
    const at = dripAt(d, Math.max(0, s));
    return Math.abs(x - at.x) < trailHalf(d, Math.max(0, s)) + 2 * TRAIL_SOFT * at.r + r + margin;
  });
}

/** Distance from (px, py) to the segment a–b. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The droplets (fog px) a wipe stroke from `a` to `b`, brush radius `brush`, has wiped away: of those whose middle it
 * reaches, the ones the glass is now at least half cleared over (`cleared`, 0–1, asked only for those).
 */
export function wipedAway<T extends { x: number; y: number }>(drops: T[], a: { x: number; y: number }, b: { x: number; y: number }, brush: number, cleared: (x: number, y: number) => number) {
  return drops.filter((d) => segmentDistance(d.x, d.y, a.x, a.y, b.x, b.y) < brush && cleared(d.x, d.y) >= 0.5);
}

/** The radii of all the droplet covered where it sat (wobble and elongation included), to sweep its spot once it leaves. */
export function dripSpot(d: Drip) {
  const rx = d.r * (1 + d.wob * 1.5);
  return [rx, rx * d.e] as const;
}

/**
 * Whether a droplet shows well enough to run from: `edge`, how far the pane's soft edge lets it show (fadeAt, 0–1); not
 * by the writing; and not wiped or swept away: the fog canvas under it nearly opaque (`fogAlpha`, 0–255; unwiped it is
 * opaque at every fade, the pane's edge being backed by what's behind it), unless it condensed since (over the fog). One
 * the glass picks itself (its own run, the drop button) shows fully, at least half; one tapped only needs to be in
 * sight (a tenth: about where droplets fade from view), so that any droplet seen there runs when tapped, while a click
 * where they have all but faded out still wipes.
 */
export function showsToRun(d: { edge: number; nearText: boolean; grown: boolean; fogAlpha: number }, tapped: boolean) {
  return d.edge >= (tapped ? 0.1 : 0.5) && !d.nearText && (d.grown || d.fogAlpha >= 255 * 0.85);
}

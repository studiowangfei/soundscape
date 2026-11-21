/**
 * Liquid Glass refraction as a displacement map (for an SVG feDisplacementMap): which way, and how far, the view
 * through each point of a rounded-rect pane is bent. The pane is flat glass whose edge rounds over in a bezel; seen
 * through the bezel, the backdrop comes from further in, magnified towards the rim like a lens. Pure, so it's tested
 * in Node; Glass.tsx draws it to a canvas.
 */

/** The soft profile's exponent: the bend falls off as (1 − t)² across the bezel. */
export const LENS_POWER = 2;

/**
 * The bezel's shape across its width (Tune → Glass → Edge shape), by position in EDGE_SHAPES (the dropdown's order):
 * - soft (ours, the default): the bend falls off as (1 − t)², gently, over the whole bezel.
 * - squircle (from @zakisheriff/liquid-glass, MIT, github.com/zakisheriff/Liquid-Glass): light refracted (Snell's law,
 *   glass's index 1.5) through an edge whose cross-section is a convex squircle, (1 − (1 − t)⁴)^¼. Nearly all its bend
 *   sits right at the rim: a quarter of the way in it keeps about a quarter of it (soft: half), and it's all but flat
 *   past halfway, so the edge reads as a thin, hard bevel on flat glass.
 */
export const EDGE_SHAPES = ["soft", "squircle"] as const;
export type EdgeShape = (typeof EDGE_SHAPES)[number];

/** The squircle's index of refraction (glass). */
const IOR = 1.5;

/**
 * The squircle bezel's sideways shift at depth t (0 at the rim, 1 where it turns flat), unscaled: the angle between a
 * ray entering the curved surface and the same ray refracted, times the glass's height there (thicker glass, longer
 * path; the 0.35 keeps the rim itself bending). t starts just inside the rim, where the slope is infinite.
 */
function squircleShift(t: number): number {
  const q = 1 - Math.max(0.002, t);
  const base = 1 - q ** 4;
  const slope = q ** 3 / Math.max(1e-4, base ** 0.75);
  const incident = Math.atan(slope);
  const refracted = Math.asin(Math.sin(incident) / IOR);
  return Math.tan(incident - refracted) * (0.35 + 0.65 * base ** 0.25);
}

/**
 * How strongly the bezel bends the view at each depth into it, from the rim (index 0) to where the glass turns flat
 * (last, none), at most 1 (the full bend, Refraction in settings.ts). Pulling the view inward like this magnifies the
 * backdrop towards the rim, the way a thick convex edge does. Soft is (1 − t)^LENS_POWER: it folds over (a mirrored
 * sliver at the rim) only once the bend exceeds bezel / LENS_POWER, so that's what a Refraction of 1 means. The
 * squircle, peaking a hair inside the rim and falling faster, folds from a Refraction of about 0.4; at the default
 * (1.6) it folds as far as the library's own cards do.
 */
export function lensProfile(samples: number, shape: EdgeShape = "soft"): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    out[i] = shape === "squircle" ? squircleShift(t) : (1 - t) ** LENS_POWER;
  }
  if (shape === "squircle") {
    const peak = Math.max(...out);
    for (let i = 0; i < samples; i++) out[i] /= peak;
  }
  return out;
}

export type MapSpec = { width: number; height: number; radius: number; bezel: number };

/**
 * RGBA pixels (row by row, `width` × `height`) for feDisplacementMap. R and G hold the sampling offset as a share of
 * the filter's scale (128 = none, 255 = all of it towards +x/+y, 0 towards −x/−y), pointing inward across the bezel:
 * the view there comes from further inside the pane. B weighs the bezel, 255 at the rim easing to 0 where the glass
 * turns flat, as (1 − t)², with no plateau or step (the edge glow fades in by it). Round the corners the pull points at
 * the corner's centre; a bezel wider than the corner radius follows a rounder inner curve, so it never folds.
 */
export function displacementMap({ width, height, radius, bezel }: MapSpec, profile: Float32Array = lensProfile(256)): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  const rv = Math.min(Math.max(radius, bezel), width / 2, height / 2);
  const last = profile.length - 1;
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    const cy = py < rv ? rv : py > height - rv ? height - rv : py;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const cx = px < rv ? rv : px > width - rv ? width - rv : px;
      // d: how far in from the edge; (nx, ny): the edge's outward direction.
      let d: number;
      let nx = 0;
      let ny = 0;
      if (cx !== px && cy !== py) {
        const vx = px - cx;
        const vy = py - cy;
        const len = Math.hypot(vx, vy) || 1;
        d = rv - len;
        nx = vx / len;
        ny = vy / len;
      } else {
        const l = px;
        const r = width - px;
        const t = py;
        const b = height - py;
        d = Math.min(l, r, t, b);
        if (d === l) nx = -1;
        else if (d === r) nx = 1;
        else if (d === t) ny = -1;
        else ny = 1;
      }
      const k = (y * width + x) * 4;
      out[k + 3] = 255;
      if (d >= bezel) {
        out[k] = 128;
        out[k + 1] = 128;
        continue;
      }
      const t = Math.max(0, d) / bezel;
      const f = t * last;
      const i0 = Math.floor(f);
      const m = profile[i0] + (profile[Math.min(last, i0 + 1)] - profile[i0]) * (f - i0);
      out[k] = Math.round(128 - nx * m * 127);
      out[k + 1] = Math.round(128 - ny * m * 127);
      out[k + 2] = Math.round(255 * (1 - t) ** 2);
    }
  }
  return out;
}

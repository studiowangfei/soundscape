/**
 * Liquid Glass refraction as a displacement map (for an SVG feDisplacementMap): which way, and how far, the view
 * through each point of a rounded-rect pane is bent. The pane is flat glass whose edge rounds over in a bezel; seen
 * through the bezel, the backdrop comes from further in, magnified towards the rim like a lens. Pure, so it's tested
 * in Node; Glass.tsx draws it to a canvas.
 */

/** The lens profile's exponent: the bend falls off as (1 − t)² across the bezel. */
export const LENS_POWER = 2;

/**
 * How strongly the bezel bends the view at each depth into it, from the rim (index 0, the full bend) to where the
 * glass turns flat (last, none): (1 − t)^LENS_POWER. Pulling the view inward like this magnifies the backdrop towards
 * the rim, the way a thick convex edge does; it folds over (a mirrored sliver at the rim) only once the bend exceeds
 * bezel / LENS_POWER, so that's what a Refraction of 1 means (see settings.ts).
 */
export function lensProfile(samples: number): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = (1 - i / (samples - 1)) ** LENS_POWER;
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

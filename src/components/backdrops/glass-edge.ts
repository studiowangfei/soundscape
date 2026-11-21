/**
 * Droplets where a song page's fog pane fades out at its edges (its edge bleed). The mist thins out there, so the
 * condensation does too: each droplet is either on the glass, at full strength, or not there at all, kept about as
 * often as the mist is strong where it sits. (They used to fade with the mist, which made them see-through: droplets
 * that seemed to be behind another layer of fog, 2026-11-21.)
 */

/** A small hash of a droplet's index on a pane of glass, 0–1, the same every time. */
function hash(i: number, seed: number) {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Whether droplet `i` of the pane with glass seed `seed` is on the glass where the mist is `fade` strong (the pane's
 * edge fade there, 0–1). A droplet kept at some strength is kept at every greater one.
 */
export function keepDrop(i: number, seed: number, fade: number) {
  return hash(i, seed) < fade;
}

/** How strong a drop moving over the glass is drawn where the mist is `fade` strong: whole, but for the last stretch
 * before the glass's very edge, where it fades out (a run going off the pane). */
export function glassAlpha(fade: number) {
  const t = Math.min(1, Math.max(0, fade / 0.35));
  return t * t * (3 - 2 * t);
}

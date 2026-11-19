/**
 * TRIAL (2026-11-17), kept as it is for the user to revisit (2026-11-18): the landing page's cover changes drifting
 * the way the song pages' do (Tune → Cover change), the whole picture moving, droplets and all, which the landing
 * page's one window (its glass staying put whatever song is behind it) argues against. To drop it: delete this file
 * and the lines marked "drift trial" (landing/Landing.tsx, backdrops/variants.tsx thaw()).
 *
 * The landing page sets `next` as its cover changes (px: positive as the wheel goes down to a later song, negative
 * back up, 0 none); the fog takes it as it fades the old cover out.
 */
export const landingDrift = { next: 0 };

/** Which way the wheel went from song `from` to song `to` of `count` (it loops: the shorter way round): 1, -1 or 0. */
export function wheelWay(from: number, to: number, count: number): number {
  let d = (((to - from) % count) + count) % count;
  if (d > count / 2) d -= count;
  return Math.sign(d);
}

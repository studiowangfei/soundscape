/**
 * Shaking the phone lets drops fall down the glass, on the landing page and song pages (ShakeDrops). A shake is the phone jolted back and
 * forth a few times close together. A jolt is the phone pushed hard (its acceleration without gravity past `jolt` m/s²)
 * the other way from the last jolt (their directions more than `reverse` apart: the cosine between them under it), so
 * each push counts once however long it lasts, and a hard shake counts even when the hand never comes to rest between
 * pushes (it twists as it shakes). `jolts` of them within `windowMs` make a shake. Walking, tilting or putting the phone
 * down stay well under it (one bump is two jolts, its start and its stop). The harder the shake, the more drops:
 * `minDrops`, one more for each `perDrop` m/s² its hardest push went past `jolt`, at most `maxDrops`. Then it rests
 * `cooldownMs`, so a long shake doesn't flood the glass.
 */
export const SHAKE = { jolt: 12, reverse: -0.3, jolts: 4, windowMs: 1000, cooldownMs: 2500, minDrops: 4, perDrop: 4, maxDrops: 10 } as const;

type Vec = [number, number, number];
export type ShakeState = { jolts: number[]; dir: Vec | null; peak: number; quietUntil: number };

/** One motion reading: acceleration `a` (x, y, z, m/s², gravity left out) at `now` ms. Returns the new state and how many drops to let fall (0: none). */
export function shakeTick(state: ShakeState | null, { now, a }: { now: number; a: Vec }): { state: ShakeState; drops: number } {
  const s = state ?? { jolts: [], dir: null, peak: 0, quietUntil: 0 };
  if (now < s.quietUntil) return { state: s, drops: 0 };
  let jolts = s.jolts.filter((t) => now - t <= SHAKE.windowMs);
  let { dir, peak } = s;
  if (!jolts.length) [dir, peak] = [null, 0];
  const size = Math.hypot(...a);
  if (size > SHAKE.jolt) {
    const d = a.map((v) => v / size) as Vec;
    if (!dir || d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2] < SHAKE.reverse) {
      jolts = [...jolts, now];
      dir = d;
    }
    peak = Math.max(peak, size);
  }
  if (jolts.length < SHAKE.jolts) return { state: { jolts, dir, peak, quietUntil: s.quietUntil }, drops: 0 };
  const drops = Math.min(SHAKE.maxDrops, SHAKE.minDrops + Math.floor((peak - SHAKE.jolt) / SHAKE.perDrop));
  return { state: { jolts: [], dir: null, peak: 0, quietUntil: now + SHAKE.cooldownMs }, drops };
}

/** Told when an iPhone has just been allowed the motion sensor (ShakeDrops listens afresh). */
export const MOTION_ALLOWED = "soundscape:motion-allowed";

let asked = false;
/**
 * Asks for the motion sensor where the browser makes a page ask (iPhones and iPads, from iOS 13: a system prompt). Only
 * from a tap (the landing page's 💧), once per visit; a phone that was allowed before says yes without asking. Android
 * browsers don't ask (nothing to do here).
 */
export function askMotion() {
  const sensor = typeof DeviceMotionEvent === "undefined" ? null : (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> });
  if (asked || typeof sensor?.requestPermission !== "function" || !window.matchMedia("(pointer: coarse)").matches) return;
  asked = true;
  sensor
    .requestPermission()
    .then((answer) => answer === "granted" && window.dispatchEvent(new Event(MOTION_ALLOWED)))
    .catch(() => {}); // not from a tap, or not over HTTPS: no shaking
}

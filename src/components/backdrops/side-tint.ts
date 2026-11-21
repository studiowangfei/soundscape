/**
 * The side tint: on a song page, the part of the window the cover doesn't reach (left of it on wide screens, below it
 * on upright phones and tablets) takes on the colours of the cover's edge beside it, as light from the cover would,
 * instead of staying the page's near-black. The colours are the cover's edge band (as seen through the mist), softened
 * along it until no detail is left, at the tint's strength where the fog's own edge fade begins, falling off to `far` of
 * that at the window's edge. Painted into the fog's scene under the cover (variants.tsx), so the fog fades into it, and
 * carried by the moving cover between the landing page and a song's (Stage.tsx).
 */
import { BG } from "./art";

export type RGB = [number, number, number];

/**
 * Where the tint goes, in CSS px. `side`: the window's part left of the cover or below it. Along the tint's run (x for
 * "left", y for "below"), `edge` is where the fog pane ends (its edge bleed's outer edge): the tint is at full strength
 * from there on (under the fog and the cover) and falls off towards the window's edge (x 0, or y H). Across it, the
 * colours are laid from `a0` to `a1`, the cover's span beside it (held at the ends beyond).
 */
export type TintGeom = { side: "left" | "below"; edge: number; a0: number; a1: number };

/** CSS px per sample of the painted tint (it's soft, so drawn scaled up). */
export const TINT_STEP = 2;
/** How the tint falls off from the fog's edge to the window's: its share of the way back up, raised to this. */
export const TINT_CURVE = 1.4;

/**
 * The tint's place for a page's cover frame (art.ts coverFrame) with the fog's edge bleed `bleed` (CSS px, edgeBleed):
 * null on the full-screen pane, and where the fog already runs to the window's edge.
 */
export function tintGeometry(f: { wide: boolean; fill: boolean; side: number; ox: number; oy: number }, W: number, H: number, bleed: number): TintGeom | null {
  if (f.fill) return null;
  if (f.wide) {
    const edge = f.ox - bleed;
    return edge > 0 ? { side: "left", edge, a0: f.oy, a1: f.oy + f.side } : null;
  }
  const edge = f.oy + f.side + bleed;
  return edge < H ? { side: "below", edge, a0: f.ox, a1: f.ox + f.side } : null;
}

/**
 * The colours along a cover's edge, `n` of them: the band `band` (a fraction of the cover's side) in from its left edge,
 * averaged row by row in n runs down it, or in from its bottom edge, column by column across it. `px` is RGBA, `width` px
 * wide, with the cover's square at `box`; `top` (RGBA, straight alpha, same size), if given, is laid over it first (the
 * mist over the clear cover).
 */
export function edgeColours(px: Uint8ClampedArray, width: number, box: { x: number; y: number; w: number; h: number }, side: TintGeom["side"], n: number, band: number, top?: Uint8ClampedArray): RGB[] {
  const left = side === "left";
  const depth = Math.max(1, Math.round(band * (left ? box.w : box.h)));
  const length = left ? box.h : box.w;
  const out: RGB[] = [];
  for (let k = 0; k < n; k++) {
    const s0 = Math.floor((k * length) / n);
    const s1 = Math.max(s0 + 1, Math.floor(((k + 1) * length) / n));
    let r = 0, g = 0, b = 0, count = 0; // prettier-ignore
    for (let s = s0; s < s1; s++)
      for (let d = 0; d < depth; d++) {
        const x = left ? box.x + d : box.x + s;
        const y = left ? box.y + s : box.y + box.h - 1 - d;
        const i = (y * width + x) * 4;
        const a = top ? top[i + 3] / 255 : 0;
        r += top ? top[i] * a + px[i] * (1 - a) : px[i];
        g += top ? top[i + 1] * a + px[i + 1] * (1 - a) : px[i + 1];
        b += top ? top[i + 2] * a + px[i + 2] * (1 - a) : px[i + 2];
        count++;
      }
    out.push([r / count, g / count, b / count]);
  }
  return out;
}

/** The colours blurred along their run (a Gaussian, `sigma` samples), the ends held so they don't darken. */
export function softened(cols: RGB[], sigma: number): RGB[] {
  const reach = Math.ceil(sigma * 3);
  const weights = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)));
  const total = weights.reduce((a, w) => a + w, 0);
  return cols.map((_, i) => {
    const c: RGB = [0, 0, 0];
    weights.forEach((w, j) => {
      const src = cols[Math.min(cols.length - 1, Math.max(0, i + j - reach))];
      for (let k = 0; k < 3; k++) c[k] += (src[k] * w) / total;
    });
    return c;
  });
}

/** A small hash of a sample's place, 0–1, for dithering (the same every time, so a rebuild looks the same). */
function hash(x: number, y: number, salt: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The tint over the whole window (W × H CSS px), one sample every TINT_STEP px (to be drawn scaled up), opaque: the page's
 * colour with the edge colours `cols` laid over it at `strength` from the fog's edge in, falling off to `far` of that at
 * the window's edge. Dithered (±1 level, triangular), as a dark ramp this long would otherwise show bands one level apart.
 * Null at strength 0.
 */
export function paintTint(g: TintGeom, cols: RGB[], W: number, H: number, strength: number, far: number) {
  if (!(strength > 0) || !cols.length) return null;
  const width = Math.ceil(W / TINT_STEP);
  const height = Math.ceil(H / TINT_STEP);
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const left = g.side === "left";
  const run = left ? g.edge : H - g.edge; // from the window's edge to the fog's
  const colourAt = (a: number): RGB => {
    const u = Math.min(1, Math.max(0, (a - g.a0) / (g.a1 - g.a0))) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(u));
    if (i < 0) return cols[0];
    const t = u - i;
    return [0, 1, 2].map((k) => cols[i][k] + (cols[i + 1][k] - cols[i][k]) * t) as RGB;
  };
  const alphaAt = (d: number) => strength * (far + (1 - far) * Math.pow(Math.min(1, Math.max(0, d / run)), TINT_CURVE));
  // Across: the strength column by column on the left, the colour column by column below.
  const across = Array.from({ length: width }, (_, x) => (x + 0.5) * TINT_STEP);
  const colA = left ? across.map(alphaAt) : null;
  const colCol = left ? null : across.map(colourAt);
  for (let y = 0; y < height; y++) {
    const cy = (y + 0.5) * TINT_STEP;
    const rowCol = left ? colourAt(cy) : null;
    const rowA = left ? 0 : alphaAt(H - cy);
    for (let x = 0; x < width; x++) {
      const c = rowCol ?? colCol![x];
      const a = colA ? colA[x] : rowA;
      const dither = hash(x, y, 1) + hash(x, y, 2) - 1;
      const i = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = Math.round(BG[k] + (c[k] - BG[k]) * a + dither);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** How the cover's edge is read for the tint: 32 colours along it, from a band 6% of its side deep, softened over 4 of
 * them (an eighth of the cover), so what's left is its colours, not its shapes. */
export const TINT_SAMPLES = 32;
export const TINT_BAND = 0.06;
export const TINT_SOFT = 4;

/** The tint's colours from a cover (see edgeColours for the arguments), softened. */
export function tintColours(px: Uint8ClampedArray, width: number, box: { x: number; y: number; w: number; h: number }, side: TintGeom["side"], top?: Uint8ClampedArray): RGB[] {
  return softened(edgeColours(px, width, box, side, TINT_SAMPLES, TINT_BAND, top), TINT_SOFT);
}

/** The tint's colours from a picture on a canvas with the cover's square `cover` px a side, `inner` px in from its
 * corner (the moving cover's misted picture, with its margin): only the band is read back. */
export function pictureTintColours(c: HTMLCanvasElement, cover: number, inner: number, side: TintGeom["side"]): RGB[] {
  const depth = Math.max(1, Math.round(TINT_BAND * cover));
  const left = side === "left";
  const band = c.getContext("2d")!.getImageData(inner, left ? inner : inner + cover - depth, left ? depth : cover, left ? cover : depth).data;
  // The band read back is the cover's edge strip on its own: its box is laid so that strip is where edgeColours reads.
  const box = left ? { x: 0, y: 0, w: cover, h: cover } : { x: 0, y: depth - cover, w: cover, h: cover };
  return tintColours(band, left ? depth : cover, box, side);
}

/** The colours made `k` times as bright (the moving cover's picture has the page left's brightness). */
export const brighter = (cols: RGB[], k: number): RGB[] => cols.map((c) => c.map((v) => v * k) as RGB);

/** A painted tint (paintTint) on a canvas, one px a sample: to be drawn TINT_STEP times its size. */
export function tintCanvas(t: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = t.width;
  c.height = t.height;
  c.getContext("2d")!.putImageData(new ImageData(t.data, t.width, t.height), 0, 0);
  return c;
}

/**
 * The droplets' own layer (variants.tsx): the droplets on the glass drawn at the screen's px, sharp, over the part of
 * the pane the window shows, while the mist under them, soft anyway, is rendered coarser (1 px per CSS px on touch
 * screens, at most 1.5 elsewhere). Pure, so it's tested in Node.
 */
import { dripAt, dropOutline, TRAIL_HALF, TRAIL_SOFT, type Drip } from "./drip";
import { lensBox, type LensView } from "./fog-render";

/** The most px the droplets' layer has (about a 2× 1440 × 900 window's, a little more); a bigger window gets fewer. */
export const BEADS_MAX_PX = 6_000_000;

export type BeadBox = ReturnType<typeof lensBox>;

/**
 * Where the droplets' layer goes. `W` × `H` is the backdrop (CSS px), `dpr` the screen's px per CSS px, the pane's
 * top-left is at (`paneX`, `paneY`) (CSS px), `span` CSS px a side, rendered at `size` fog px a side.
 *
 * The pane is moved onto whole screen px (`paneX`, `paneY`: less than half a screen px), so the layer's px are the
 * screen's own: `k` of them per fog px, the droplets drawn for `view` (renderFog), filling `box` (lensBox). `css` is
 * the layer's place and size on the page. Past BEADS_MAX_PX, `k` is less, and the layer is stretched over the same
 * part of the window.
 */
export function beadBox(o: { W: number; H: number; dpr: number; paneX: number; paneY: number; span: number; size: number; maxPx?: number }) {
  const { W, H, dpr, span, size } = o;
  const [ix, iy] = [Math.round(o.paneX * dpr), Math.round(o.paneY * dpr)]; // the pane's corner, screen px
  const native = (dpr * span) / size; // screen px per fog px
  // The window's part of the pane, fog px.
  const x0 = Math.max(0, -ix / native);
  const y0 = Math.max(0, -iy / native);
  const x1 = Math.min(size, (Math.round(W * dpr) - ix) / native);
  const y1 = Math.min(size, (Math.round(H * dpr) - iy) / native);
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const k = Math.min(native, Math.sqrt((o.maxPx ?? BEADS_MAX_PX) / area));
  // A quarter px in from each edge, so lensBox's rounding out doesn't take in a px more for a rounding error.
  const e = 0.25 / k;
  const view: LensView = { k, x: x0 + e, y: y0 + e, w: Math.max(0, x1 - x0 - 2 * e), h: Math.max(0, y1 - y0 - 2 * e) };
  const box = lensBox(size, view);
  const r = native / k; // screen px per layer px: 1 unless capped
  const css = { left: (ix + box.x * r) / dpr, top: (iy + box.y * r) / dpr, width: (box.w * r) / dpr, height: (box.h * r) / dpr };
  return { k, view, box, paneX: ix / dpr, paneY: iy / dpr, css };
}

/** A point (and radius) in fog px, on the droplets' layer. */
export function toBeads(box: BeadBox, at: { x: number; y: number; r: number }) {
  return { x: at.x * box.k - box.x, y: at.y * box.k - box.y, r: at.r * box.k };
}

/**
 * Carrying what's on the layer (the drops left where runs stopped) onto a new one, pinned to the cover: a px of the
 * old layer at (x, y) goes to (x·s + x0, y·s + y0) of the new. The new pane's fog px are the old ones × `K` + `shift`
 * (the pane rebuilt for a new size), as for the glass's other layers.
 */
export function beadsCarry(was: BeadBox, now: BeadBox, K: number, shift: number) {
  const s = (K * now.k) / was.k;
  return { s, x: was.x * s + shift * now.k - now.x, y: was.y * s + shift * now.k - now.y };
}

/**
 * Where a run going on changes the droplets' layer from frame to frame: the strip its trail so far covers (variants.tsx
 * trailPath, its spot and its soft edge: blur(σ) reaches about 3σ), as layer px [x, y, w, h], rounded out. A run's
 * drop is on a canvas of its own; its trail cuts through the droplets.
 */
export function trailStrip(d: Drip, s: number, box: BeadBox): [number, number, number, number] {
  const n = Math.max(2, Math.ceil((s * d.len) / 3));
  let [x0, x1] = [d.x0, d.x0];
  for (let i = 0; i <= n; i++) {
    const { x } = dripAt(d, (s * i) / n);
    [x0, x1] = [Math.min(x0, x), Math.max(x1, x)];
  }
  const [a, b] = dropOutline(d); // the trail is never wider than the spot the drop left, which is its top
  const m = Math.max(a, d.r * TRAIL_HALF) + Math.max(1, d.r * TRAIL_SOFT) * 3 + 1;
  const top = toBeads(box, { x: x0 - m, y: d.y0 - b - m, r: 0 });
  const end = toBeads(box, { x: x1 + m, y: dripAt(d, s).y + m, r: 0 });
  const [l, t] = [Math.floor(top.x), Math.floor(top.y)];
  return [l, t, Math.ceil(end.x) - l, Math.ceil(end.y) - t];
}

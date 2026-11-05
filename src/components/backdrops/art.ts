"use client";

import { useEffect, useState } from "react";
import { isWide } from "../env";

export type Song = { title: string; artist: string; cover: string; coverKind: "album" | "artist" };
export type LoadedArt = { img: HTMLImageElement; kind: "album" | "artist"; src: string };

export const BG: [number, number, number] = [13, 11, 10];

/**
 * Loads a same-origin cover (or artist photo) so canvases can read its pixels.
 * Returns null until it loads, and stays null if it fails, so the backdrop keeps its dark base colour.
 */
export function useArtwork(src: string, kind: "album" | "artist"): LoadedArt | null {
  const [art, setArt] = useState<LoadedArt | null>(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = src;
    // Decoded off the main thread before it's handed over, so drawing it the first time doesn't stall the page.
    img.decode().then(
      () => alive && setArt({ img, kind, src }),
      () => alive && setArt(null),
    );
    return () => {
      alive = false;
    };
  }, [src, kind]);
  return art;
}

/**
 * "beside": the song pages' cover next to the content (wide layout), or across the top of the window (stacked layout);
 * "fill": the cover fills the whole window (the landing page).
 */
export type Layout = "beside" | "fill";

/** The stacked layout's cover covers the window's top 70% (globals.css .cover-box and .animate-subtle-zoom mirror it). */
export const STACK = 0.7;

/**
 * Where the cover sits. Beside: a square on the right in the wide layout (landscape screens; see env.ts); in the
 * stacked one (portrait screens: phones, iPads held upright) a square covering the window's top 70% (the window's
 * width, or that band's height if more), centred in it, its edge bleed fading on down into the rest. Fill: a square as
 * big as the window's longer side, centred, so the window crops it. `wide`: the browser's own answer (wideNow()), which
 * is exactly what CSS lays out by; from the size when not given.
 */
export function coverFrame(W: number, H: number, layout: Layout = "beside", wide = isWide(W, H)) {
  if (layout === "fill") {
    const side = Math.max(W, H);
    return { wide, fill: true, side, ox: Math.round((W - side) / 2), oy: Math.round((H - side) / 2) };
  }
  if (!wide) {
    const band = H * STACK;
    const side = Math.round(Math.max(W, band));
    return { wide, fill: false, side, ox: Math.round((W - side) / 2) || 0, oy: Math.round((band - side) / 2) || 0 }; // || 0: no -0
  }
  const side = Math.round(Math.min(H * 0.92, W * 0.52));
  return { wide, fill: false, side, ox: W - side, oy: Math.round((H - side) / 2) };
}

/**
 * How far (CSS px) a song page's fogged pane runs past its cover, fading out (the tuned Edge bleed): none on the
 * full-screen pane; on the stacked layout no further than 60% of the way down the window's part below the cover (its
 * top and sides are off screen), so the cover only spills a little way into it.
 */
export function edgeBleed(f: { wide: boolean; fill: boolean; side: number; oy: number }, H: number, bleed: number) {
  if (f.fill) return 0;
  if (f.wide) return bleed;
  return Math.round(Math.min(bleed, Math.max(0, H - f.oy - f.side) * 0.6));
}

/**
 * How much smaller droplets must be drawn on a full-screen pane to look as they do on a song page's cover (plus its
 * edge bleed) in the same window: the ratio of the two panes' sizes on screen.
 */
export function fillDropScale(W: number, H: number, bleed: number) {
  const f = coverFrame(W, H);
  return (f.side + 2 * edgeBleed(f, H, bleed)) / Math.max(W, H);
}

/** Centre-crops to a square and area-averages down to n×n (halving in steps, so no aliasing). Returns RGBA. */
export function sampleSquare(img: HTMLImageElement, n: number): Uint8ClampedArray {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  let cur = document.createElement("canvas");
  cur.width = cur.height = s;
  cur.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, s, s);
  while (cur.width / 2 >= n) {
    const next = document.createElement("canvas");
    next.width = next.height = Math.round(cur.width / 2);
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }
  const out = document.createElement("canvas");
  out.width = out.height = n;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, n, n);
  return ctx.getImageData(0, 0, n, n).data;
}

export type RGB = [number, number, number];

/** Dominant colours by k-means on a 24×24 sample, most common first. */
export function palette(img: HTMLImageElement, k = 5): RGB[] {
  const px = sampleSquare(img, 24);
  const pts: RGB[] = [];
  for (let i = 0; i < px.length; i += 4) pts.push([px[i], px[i + 1], px[i + 2]]);
  let centers = Array.from({ length: k }, (_, j) => pts[Math.floor(((j + 0.5) / k) * pts.length)]);
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of pts) {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) [bd, best] = [d, j];
      });
      counts[best]++;
      for (let ch = 0; ch < 3; ch++) sums[best][ch] += p[ch];
    }
    centers = centers.map((c, j) => (counts[j] ? (sums[j].map((v) => v / counts[j]) as RGB) : c));
  }
  return centers.map((c, j) => ({ c, n: counts[j] })).sort((a, b) => b.n - a.n).map((x) => x.c.map(Math.round) as RGB);
}

const sat = ([r, g, b]: RGB) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
const lum = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The palette colour that reads best as an accent: saturated and not too dark. */
export function accentOf(colors: RGB[]): RGB {
  const scored = colors.map((c) => ({ c, s: sat(c) * 1.4 + Math.min(lum(c), 0.7) - (lum(c) < 0.12 ? 1 : 0) }));
  return scored.sort((a, b) => b.s - a.s)[0]?.c ?? [200, 160, 120];
}

export const rgb = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const luminance = lum;
export const saturation = sat;

/**
 * The size of the backdrop (the box a canvas fills). Backdrops are as tall as the window with the browser's toolbars
 * tucked away (100lvh), so on phones they don't change size, and redraw, as the toolbars come and go while scrolling.
 */
export function backdropSize(c: HTMLElement) {
  const box = c.parentElement;
  return { W: box?.clientWidth || window.innerWidth, H: box?.clientHeight || window.innerHeight };
}

/** Fit a canvas to its backdrop at device resolution (capped at 2x) and return a CSS-pixel context. */
export function fitCanvas(c: HTMLCanvasElement) {
  const { W, H } = backdropSize(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

/** Redraw on resize (rAF-throttled). */
export function useResizeDraw(draw: () => void, deps: unknown[]) {
  useEffect(() => {
    let raf = 0;
    draw();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** A scene canvas's push-in as it is right now (transform and origin), to hold a frozen copy exactly in place. */
export function holdTransform(style: { transform: string; transformOrigin: string }) {
  return { transform: style.transform, transformOrigin: style.transformOrigin };
}

/** Where the scene pushes in towards: the centre on the full-screen pane; song pages keep the style's own origin. */
export function zoomOrigin(layout: Layout): string | undefined {
  return layout === "fill" ? "50% 50%" : undefined;
}

/**
 * How far the scene is pushed in `t` seconds after it appeared, as a scale: in to 1 + `zoom`% over `secs`, then back out,
 * eased (CSS ease-in-out), starting a fifth of the way in. The same timing as the subtle-zoom animation the other styles
 * use (globals.css), worked out here because the Fog style moves its mist in step with the scene.
 */
export function zoomAt(t: number, zoom: number, secs: number) {
  if (!zoom || !(secs > 0)) return 1;
  const run = t / secs + 0.2;
  const lap = Math.floor(run);
  const along = lap % 2 === 0 ? run - lap : 1 - (run - lap); // alternate: out on every other lap
  return 1 + (zoom / 100) * easeInOut(along);
}

/** CSS ease-in-out, cubic-bezier(0.42, 0, 0.58, 1): solved for the curve's x by Newton's method, then its y. */
function easeInOut(x: number) {
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  const slope = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = curve(t, 0.42, 0.58) - x;
    const d = slope(t, 0.42, 0.58);
    if (Math.abs(err) < 1e-7 || !d) break;
    t = Math.min(1, Math.max(0, t - err / d));
  }
  return curve(t, 0, 1);
}

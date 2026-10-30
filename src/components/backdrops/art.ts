"use client";

import { useEffect, useState } from "react";

export type Song = { title: string; artist: string; cover: string; coverKind: "album" | "artist" };
export type LoadedArt = { img: HTMLImageElement; kind: "album" | "artist"; src: string };

/** Matches Tailwind `lg`, where the content column moves left of the cover. */
export const WIDE_MIN = 1024;
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

/** "beside": the song pages' cover next to the content; "fill": the cover fills the whole window (the landing page). */
export type Layout = "beside" | "fill";

/**
 * Where the cover sits. Beside: a square on the right on wide screens, across the top on narrow ones. Fill: a square
 * as big as the window's longer side, centred, so the window crops it.
 */
export function coverFrame(W: number, H: number, layout: Layout = "beside") {
  const wide = W >= WIDE_MIN;
  if (layout === "fill") {
    const side = Math.max(W, H);
    return { wide, fill: true, side, ox: Math.round((W - side) / 2), oy: Math.round((H - side) / 2) };
  }
  const side = wide ? Math.round(Math.min(H * 0.92, W * 0.52)) : W;
  return { wide, fill: false, side, ox: wide ? W - side : 0, oy: wide ? Math.round((H - side) / 2) : 0 };
}

/**
 * How much smaller droplets must be drawn on the full-screen pane to look as they do on a song page's (cover plus
 * edge bleed) in the same window: the ratio of the two panes' sizes on screen.
 */
export function fillDropScale(W: number, H: number, bleed: number) {
  return (coverFrame(W, H).side + 2 * bleed) / Math.max(W, H);
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

/** Fit a canvas to the viewport at device resolution (capped at 2x) and return a CSS-pixel context. */
export function fitCanvas(c: HTMLCanvasElement) {
  const W = window.innerWidth;
  const H = window.innerHeight;
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

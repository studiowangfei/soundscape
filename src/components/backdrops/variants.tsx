"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { accentOf, backdropSize, BG, coverFrame, fillDropScale, fitCanvas, holdTransform, luminance, palette, rgb, sampleSquare, useResizeDraw, zoomOrigin, type Layout, type LoadedArt, type RGB, type Song } from "./art";
import { coarseNow, wideNow } from "../env";
import { claim, HOLD_MS, HOLD_SLOP, release } from "../gesture";
import { dripAt, dripProgress, dripSpot, dripStretch, newDrip, oneInThree, pathDrops, segmentDistance, sweepRadii, TRAIL_HALF, TRAIL_SOFT, type Drip } from "./drip";
import { createFogRenderer } from "./fog-client";
import type { FogResult } from "./fog-job";
import { dropPainter, fillParams, fogDrops, glassSeed, thickened } from "./fog-render";
import { FOG_FONTS, narrow, zoomStyle, type Params } from "./params";

/** Every style gets the loaded artwork, its tunable settings (see params.ts) and the song. */
type V = { art: LoadedArt; p: Params; song: Song };

/** Light falls off towards the content column: leftwards on wide screens, downwards on narrow ones. */
function falloff(x: number, y: number, f: ReturnType<typeof coverFrame>) {
  const t = f.wide ? Math.max(0, (f.ox - x) / Math.max(1, f.ox)) : Math.max(0, (y - f.side * 0.55) / (f.side * 0.6));
  return 1 - 0.55 * Math.min(1, t);
}

/** Cover-cell lookup with edge clamp, plus how far outside the cover the point is (in cells). */
function cell(x: number, y: number, f: ReturnType<typeof coverFrame>, cells: number) {
  const cp = f.side / cells;
  const cx = Math.floor((x - f.ox) / cp);
  const cy = Math.floor((y - f.oy) / cp);
  const ix = Math.max(0, Math.min(cells - 1, cx));
  const iy = Math.max(0, Math.min(cells - 1, cy));
  return { i: (iy * cells + ix) * 4, outside: Math.max(Math.abs(cx - ix), Math.abs(cy - iy)) };
}

// ── 1. Mosaic ───────────────────────────────────────────────────────────────────────────────────────
/** Pixel tiles with grout; the whole cover stays recognizable, edges bleed into the page. */
export function Mosaic({ art, p }: V) {
  const ref = useRef<HTMLCanvasElement>(null);
  useResizeDraw(() => {
    const { ctx, W, H } = fitCanvas(ref.current!);
    const f = coverFrame(W, H);
    const tile = narrow(p.tile, f.wide);
    const cells = Math.round(f.side / tile);
    const px = sampleSquare(art.img, cells);
    ctx.fillStyle = rgb(BG);
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const { i, outside } = cell(x + tile / 2, y + tile / 2, f, cells);
        const fade = Math.max(0, 1 - outside / Math.max(0.5, p.bleed)) ** 1.5;
        if (!fade) continue;
        const light = p.brightness * falloff(x, y, f);
        const c = [0, 1, 2].map((k) => BG[k] + (px[i + k] * light - BG[k]) * fade) as RGB;
        ctx.fillStyle = rgb(c.map((v, k) => v * (1 - p.grout) + BG[k] * p.grout) as RGB);
        ctx.fillRect(x, y, tile, tile);
        ctx.fillStyle = rgb(c);
        ctx.fillRect(x + 1, y + 1, tile - 1, tile - 1);
      }
    }
  }, [art, p]);
  return <canvas ref={ref} className="h-full w-full" />;
}

// ── 2. Halftone ─────────────────────────────────────────────────────────────────────────────────────
/** Print-dot duotone in the cover's own accent colour; dot size follows brightness. */
export function Halftone({ art, p }: V) {
  const ref = useRef<HTMLCanvasElement>(null);
  const accent = useMemo(() => accentOf(palette(art.img)), [art]);
  useResizeDraw(() => {
    const { ctx, W, H } = fitCanvas(ref.current!);
    const f = coverFrame(W, H);
    const pitch = narrow(p.pitch, f.wide);
    const cells = Math.round(f.side / pitch);
    const px = sampleSquare(art.img, cells);
    // Paper: near-black tinted towards the accent.
    const paper = BG.map((v, k) => v + (accent[k] - v) * p.paper) as RGB;
    ctx.fillStyle = rgb(paper);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgb(accent);
    // Rotated screen (like print halftones).
    const ang = (p.angle * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const R = Math.hypot(W, H);
    for (let v = -R; v < R; v += pitch) {
      for (let u = -R; u < R; u += pitch) {
        const x = u * cos - v * sin + W / 2;
        const y = u * sin + v * cos + H / 2;
        if (x < -pitch || y < -pitch || x > W + pitch || y > H + pitch) continue;
        const { i, outside } = cell(x, y, f, cells);
        const fade = Math.max(0, 1 - outside / Math.max(0.5, p.bleed)) ** 1.5;
        if (!fade) continue;
        const l = luminance([px[i], px[i + 1], px[i + 2]]);
        const r = (pitch / 2) * Math.sqrt(l) * p.dot * fade * falloff(x, y, f);
        if (r < 0.35) continue;
        ctx.globalAlpha = p.ink;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [art, accent, p]);
  return <canvas ref={ref} className="h-full w-full" />;
}

// ── 3. Blur ─────────────────────────────────────────────────────────────────────────────────────────
/** The cover softened just enough to go dreamy (shapes and colours still read) over its own ambient glow. */
export function Blur({ art, p }: V) {
  return (
    <div className="animate-subtle-zoom absolute inset-0 overflow-hidden" style={zoomStyle(p)}>
      <Ambient src={art.src} opacity={p.glow} />
      <div className="cover-box cover-feather">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied artwork */}
        <img
          src={art.src}
          alt=""
          className="h-full w-full scale-105 object-cover"
          style={{ filter: `blur(${p.blur}px) brightness(${p.brightness}) saturate(${p.saturation})` }}
        />
      </div>
      <div className="grain absolute inset-0 mix-blend-overlay" style={{ opacity: p.grain }} />
    </div>
  );
}

// ── 4. Zoom ─────────────────────────────────────────────────────────────────────────────────────────
/** The crisp cover, dimmed, slowly pushing in and drifting (Ken Burns), so the page breathes without moving much. */
export function Zoom({ art, p }: V) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Ambient src={art.src} opacity={p.glow} />
      <div className="cover-box cover-feather overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied artwork */}
        <img src={art.src} alt="" className="animate-slow-zoom h-full w-full object-cover" style={{ ...zoomStyle(p), filter: `brightness(${p.brightness})` }} />
      </div>
    </div>
  );
}

// ── 5. Glass ────────────────────────────────────────────────────────────────────────────────────────
/** The cover seen through reeded glass: each vertical flute shows a squeezed slice of what's behind it, with shading. */
export function Glass({ art, p }: V) {
  const ref = useRef<HTMLCanvasElement>(null);
  useResizeDraw(() => {
    const { ctx, W, H } = fitCanvas(ref.current!);
    const f = coverFrame(W, H);
    const img = art.img;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx0 = (img.naturalWidth - s) / 2;
    const sy0 = (img.naturalHeight - s) / 2;
    const k = s / f.side; // image px per screen px
    drawBleed(ctx, art, f, W, H, p.glow);
    // Flutes, drawn off-screen so the cover can be dimmed and feathered on its own. Each strip shows the region
    // around its centre squeezed (p.squeeze), so neighbouring flutes overlap like real reeded glass.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const off = document.createElement("canvas");
    off.width = off.height = Math.round(f.side * dpr);
    const o = off.getContext("2d")!;
    o.scale(dpr, dpr);
    const flute = narrow(p.flute, f.wide);
    const shade = (a: number) => Math.min(1, a * p.ridges);
    for (let x = 0; x < f.side; x += flute) {
      const w = Math.min(flute, f.side - x);
      const sw = Math.min(f.side, w * p.squeeze);
      const sx = Math.max(0, Math.min(f.side - sw, x + w / 2 - sw / 2));
      o.drawImage(img, sx0 + sx * k, sy0, sw * k, s, x, 0, w, f.side);
      const g = o.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, `rgba(0,0,0,${shade(0.38)})`);
      g.addColorStop(0.3, `rgba(255,255,255,${shade(0.07)})`);
      g.addColorStop(0.55, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${shade(0.32)})`);
      o.fillStyle = g;
      o.fillRect(x, 0, w, f.side);
    }
    o.fillStyle = rgb(BG, 1 - p.brightness);
    o.fillRect(0, 0, f.side, f.side);
    feather(o, f.wide, off.width);
    ctx.drawImage(off, f.ox, f.oy, f.side, f.side);
  }, [art, p]);
  return <canvas ref={ref} className="animate-subtle-zoom h-full w-full" style={zoomStyle(p)} />;
}

// ── 6. Pixel glass ──────────────────────────────────────────────────────────────────────────────────
/**
 * The cover through a block of square glass lenses (after Monoli's Pixel Mirror): cells abut with no grout, each
 * one a soft swatch holding a blurred, flipped view of what's behind it, with a faint bevel. Hovering a
 * cell wipes its glass away to the crisp cover underneath, and it stays clear (until the song or style changes).
 */
export function PixelGlass({ art, p }: V) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Revealed screen tiles ("tx,ty" → reveal start time) for the current tile size.
  const revealed = useRef({ tile: 0, at: new Map<string, number>() });
  const lensCache = useRef<{ key: string; src: HTMLCanvasElement } | null>(null);

  const draw = useCallback(() => {
    const { ctx, W, H } = fitCanvas(ref.current!);
    const f = coverFrame(W, H);
    const tile = narrow(p.pixel, f.wide);
    const cells = Math.round(f.side / tile);
    if (revealed.current.tile !== tile) revealed.current = { tile, at: new Map() };
    // A few samples per cell (p.detail), upscaled with smoothing, give each lens a gentle gradient instead of a flat
    // colour; each lens also sees p.spread samples past its own patch.
    const sub = p.detail;
    const win = sub + p.spread;
    const n = cells * sub;
    if (lensCache.current?.key !== `${art.src}|${n}`) {
      const src = document.createElement("canvas");
      src.width = src.height = n;
      src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(sampleSquare(art.img, n)), n, n), 0, 0);
      lensCache.current = { key: `${art.src}|${n}`, src };
    }
    const src = lensCache.current.src;
    // The crisp cover, for revealed tiles: centre-cropped square, k image px per screen px.
    const img = art.img;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx0 = (img.naturalWidth - s) / 2;
    const sy0 = (img.naturalHeight - s) / 2;
    const k = s / f.side;
    const now = performance.now();

    ctx.fillStyle = rgb(BG);
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    const edge = (c: number) => Math.max(0, Math.min(n - win, c * sub - p.spread / 2)); // source x/y of cell c, clamped
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const { i, outside } = cell(x + tile / 2, y + tile / 2, f, cells);
        const fade = Math.max(0, 1 - outside / Math.max(0.5, p.bleed)) ** 1.5;
        if (!fade) continue;
        const start = revealed.current.at.get(`${x / tile},${y / tile}`);
        const t = start === undefined ? 0 : p.revealMs > 0 ? Math.min(1, (now - start) / p.revealMs) : 1;
        const clear = t * t * (3 - 2 * t); // eased reveal progress
        if (clear < 1) {
          const cx = (i / 4) % cells;
          const cy = Math.floor(i / 4 / cells);
          // Each lens inverts its patch (and sees a little past its own edges, like real glass).
          ctx.save();
          if (p.flip) {
            ctx.translate(x + tile, y + tile);
            ctx.scale(-1, -1);
          } else {
            ctx.translate(x, y);
          }
          ctx.drawImage(src, edge(cx), edge(cy), win, win, 0, 0, tile, tile);
          ctx.restore();
          // Bevel, kept faint so cells read as glass edges rather than grout: light top/left, shade bottom/right.
          ctx.fillStyle = `rgba(255,255,255,${p.edges * 0.375 * (1 - clear)})`;
          ctx.fillRect(x, y, tile, 1);
          ctx.fillRect(x, y + 1, 1, tile - 1);
          ctx.fillStyle = `rgba(0,0,0,${p.edges * (1 - clear)})`;
          ctx.fillRect(x, y + tile - 1, tile, 1);
          ctx.fillRect(x + tile - 1, y, 1, tile - 1);
        }
        if (clear > 0) {
          ctx.globalAlpha = clear;
          ctx.drawImage(img, sx0 + (x - f.ox) * k, sy0 + (y - f.oy) * k, tile * k, tile * k, x, y, tile, tile);
          ctx.globalAlpha = 1;
        }
        // Cells past the cover's edge fade into the page.
        if (fade < 1) {
          ctx.fillStyle = rgb(BG, 1 - fade);
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
    // Dim towards the content column as one smooth gradient (per-cell dimming would step from column to column).
    // Matches falloff(): full brightness at the cover, down to 0.45 of it at the far edge of the page.
    const dim = f.wide ? ctx.createLinearGradient(0, 0, f.ox, 0) : ctx.createLinearGradient(0, f.side * 1.15, 0, f.side * 0.55);
    dim.addColorStop(0, rgb(BG, 1 - p.brightness * 0.45));
    dim.addColorStop(1, rgb(BG, 1 - p.brightness));
    ctx.fillStyle = dim;
    ctx.fillRect(0, 0, W, H);
  }, [art, p]);

  useResizeDraw(draw, [draw]);

  // The backdrop sits under the page and ignores the pointer, so watch it at the window and map it onto the canvas
  // (via its on-screen rect, which includes the slow push-in). Only tiles over the cover itself can be revealed.
  useEffect(() => {
    if (!p.reveal) return;
    let raf = 0;
    const animating = () => [...revealed.current.at.values()].some((t) => performance.now() - t < p.revealMs);
    const frame = () => {
      draw();
      raf = animating() ? requestAnimationFrame(frame) : 0;
    };
    const onMove = (e: PointerEvent) => {
      // Not while working the page's own controls (e.g. the Tune panel floats over the cover).
      if (e.target instanceof Element && e.target.closest("button, input, select, a, [role=dialog], [data-backdrop-ui]")) return;
      const r = ref.current?.getBoundingClientRect();
      if (!r || !r.width) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      const f = coverFrame(W, H);
      const tile = narrow(p.pixel, f.wide);
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const cx = (tx + 0.5) * tile;
      const cy = (ty + 0.5) * tile;
      if (cx < f.ox || cx > f.ox + f.side || cy < f.oy || cy > f.oy + f.side) return;
      const key = `${tx},${ty}`;
      if (revealed.current.tile !== tile || revealed.current.at.has(key)) return;
      const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      revealed.current.at.set(key, performance.now() - (instant ? p.revealMs : 0));
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [draw, p.pixel, p.reveal, p.revealMs]);

  return <canvas ref={ref} className="animate-subtle-zoom h-full w-full" style={zoomStyle(p)} />;
}

// ── 7. Fog ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * The cover behind a pane fogged with condensation (mist, lensing droplets, drip trails; see fog-render.ts), over
 * the crisp dimmed cover. Click and drag across it to wipe the fog away; optionally it creeps back. Wipes live in
 * their own mask, so changing fog settings keeps what's been wiped. While a song is shown the pane slowly fogs up
 * further, and now and then a droplet runs down on its own, leaving a trail. A song changing in place (the landing
 * page) changes only the scene behind the glass: wipes, trails, drops and the thickening all carry on. While `hold` is
 * on, a new cover is made but waits to go up until it's released (the landing wheel hasn't reached its song yet).
 * Each song has its own pane of glass, its droplets and trails falling differently (the same on every visit); `seed`
 * gives a fixed pane instead (the landing page's one window, whatever song is behind it).
 */
export function Fog({ art, p, song, layout = "beside", hold = false, seed }: V & { layout?: Layout; hold?: boolean; seed?: number }) {
  const pane = useMemo(() => seed ?? glassSeed(`${song.artist}\n${song.title}`), [seed, song.artist, song.title]);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);
  const fogSrc = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<FadingLayer | null>(null); // opaque where the fog has been wiped
  const built = useRef(false);
  // Mask layout: cover size and bleed margin in mask px, px per CSS px, and where the fog layer fades out at its edges.
  const geom = useRef<{ cover: number; pad: number; q: number; fade: Fade | null }>({ cover: 0, pad: 0, q: 1, fade: null });
  // The finger-written title: where the fog is cleared, and the water beads left on the glass.
  const writing = useRef<Awaited<ReturnType<typeof fingerWriting>> | null>(null);
  const clearSrc = useRef<HTMLCanvasElement | null>(null); // the clear (unfogged) view, for measuring contrast
  // A soft patch of denser fog around the writing, only as strong as needed for the text to read on this cover.
  const haze = useRef<{ layer: HTMLCanvasElement; alpha: number } | null>(null);
  const clarity = useRef(p.clarity);
  const textFog = useRef(1); // how much of the writing is still clear (1 → 0 as the fog returns over it)
  const writtenAt = useRef(0);
  // Fogging up: the same pane rendered thicker, faded in over the plain fog (0 → 1) since the pane was first shown.
  const thickSrc = useRef<HTMLCanvasElement | null>(null);
  const thickMistSrc = useRef<HTMLCanvasElement | null>(null); // its mist, for run trails fogging back over
  const thick = useRef(0);
  const shownAt = useRef(0);
  // Drops running down on their own. swept: where runs took the droplets off the glass (their trails, the spots they
  // left, the droplets they took along), which stay gone: the fog there is droplet-free mist (mistSrc). clearness: how
  // clear those places still are, a thin film at first, fading as the mist forms again. restDrops: the drops where
  // runs stopped, fading with it (rested: where they are, to repaint them over a new cover). All pinned like the wipe
  // mask; plus the drops running now, on a canvas of their own (dropsRef).
  const swept = useRef<HTMLCanvasElement | null>(null);
  const clearness = useRef<FadingLayer | null>(null);
  const mistSrc = useRef<HTMLCanvasElement | null>(null);
  const restDrops = useRef<FadingLayer | null>(null);
  const rested = useRef<{ d: Drip; at: { x: number; y: number; r: number } }[]>([]);
  const sweptAny = useRef(false); // anything swept yet (skips the pass until then)
  const scratch = useRef<{ cov: HTMLCanvasElement; clr: HTMLCanvasElement; film: HTMLCanvasElement } | null>(null);
  const drips = useRef<Drip[]>([]); // running now (several when runs start closer together than they last)
  const dropsRef = useRef<HTMLCanvasElement>(null);
  const dropsShown = useRef(false); // anything on dropsRef to clear
  const allDrops = useRef<ReturnType<typeof fogDrops>>([]);
  const gone = useRef(new Set<number>()); // droplets off the glass (runners and those they took), by layout index
  const dropLook = useRef({ film: 0.3 });
  // Running drops are painted exactly as their droplets were baked (dropPainter), hazed like the plain and thick fog.
  const painter = useRef<ReturnType<typeof dropPainter> | null>(null);
  const hides = useRef({ base: 0, thick: 0 });

  /** Fog canvas = fog image, minus the writing, plus its water beads, minus the user's wipes. */
  const compose = useCallback(() => {
    const c = fogRef.current;
    if (!c || !fogSrc.current || !mask.current) return;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(fogSrc.current, 0, 0);
    if (thickSrc.current && thick.current > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = thick.current;
      ctx.drawImage(thickSrc.current, 0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
    }
    const w = writing.current;
    if (w && w.clear.width === c.width) {
      const h = haze.current;
      if (h && h.alpha > 0) {
        ctx.globalCompositeOperation = "source-atop"; // only where there's fog to thicken
        ctx.globalAlpha = h.alpha * textFog.current;
        ctx.drawImage(h.layer, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = clarity.current * textFog.current; // a finger leaves a thin film behind
      ctx.drawImage(w.clear, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = textFog.current;
      ctx.drawImage(w.ridges, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Where runs swept the glass (and along the trail being cleared right now) the droplets are gone for good:
    // the fog there is droplet-free mist, a thin film where the glass is still clear, full where the mist has formed
    // again. Then the drops where runs stopped.
    const now = performance.now();
    const running = drips.current.map((d) => ({ d, s: dripProgress(d, now) }));
    if (swept.current && clearness.current && (running.length || sweptAny.current)) {
      if (scratch.current?.cov.width !== c.width) {
        const make = () => Object.assign(document.createElement("canvas"), { width: c.width, height: c.height });
        scratch.current = { cov: make(), clr: make(), film: make() };
      }
      const { cov, clr, film } = scratch.current;
      const trails = running.map(({ d, s }) => ({ path: trailPath(d, s), soft: `blur(${Math.max(1, d.r * TRAIL_SOFT)}px)` }));
      const addTrail = (g: CanvasRenderingContext2D) => {
        for (const t of trails) {
          g.filter = t.soft;
          g.fillStyle = "#000";
          g.fill(t.path);
        }
        g.filter = "none";
      };
      const g = cov.getContext("2d")!;
      g.globalCompositeOperation = "copy";
      g.drawImage(swept.current, 0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-over";
      addTrail(g);
      const k = clr.getContext("2d")!;
      k.clearRect(0, 0, c.width, c.height);
      clearness.current.drawOn(k, c.width, c.height);
      addTrail(k);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(cov, 0, 0);
      if (mistSrc.current) {
        const f = film.getContext("2d")!;
        f.globalCompositeOperation = "copy";
        f.drawImage(mistSrc.current, 0, 0, c.width, c.height);
        if (thickMistSrc.current && thickSrc.current && thick.current > 0) {
          // The returning mist has thickened with the rest of the pane, laid over it just as the thick fog is.
          f.globalCompositeOperation = "source-over";
          f.globalAlpha = thick.current;
          f.drawImage(thickMistSrc.current, 0, 0, c.width, c.height);
          f.globalAlpha = 1;
        }
        f.globalCompositeOperation = "destination-in";
        f.drawImage(cov, 0, 0);
        f.globalCompositeOperation = "destination-out"; // thinned to the film where the glass is still clear
        f.globalAlpha = 1 - dropLook.current.film;
        f.drawImage(clr, 0, 0);
        f.globalAlpha = 1;
        // Added, not laid over: where the swept edge is soft (coverage c) this gives fog·(1−c) + mist·c, a true
        // crossfade. Drawing over the cut fog instead leaves it only 1 − c + c² opaque, a faint stroke along the edges.
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(film, 0, 0);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    restDrops.current?.drawOn(ctx, c.width, c.height);
    ctx.globalCompositeOperation = "destination-out";
    mask.current.drawOn(ctx, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    // Running drops sit on the glass, over everything: each its droplet's own look, faded like the fog around it and
    // hazed as far as the fog has thickened, stretching only while it slides. They have a canvas of their own, above
    // the copy of the old glass that fades out when the cover changes, so a drop never doubles up mid-run.
    const top = dropsRef.current?.getContext("2d");
    if (top && (running.length || dropsShown.current)) {
      top.clearRect(0, 0, top.canvas.width, top.canvas.height);
      dropsShown.current = false;
      const paint = painter.current;
      const fade = geom.current.fade;
      if (paint && fade) {
        const hide = mixHide(hides.current, thickSrc.current ? thick.current : 0);
        for (const { d, s } of running) {
          const at = dripAt(d, s);
          paintDrop(top, paint, d, at, d.e * dripStretch(d, now), hide, fadeAt(fade, c.width, at.x, at.y));
          dropsShown.current = true;
        }
      }
    }
  }, []);

  /** Takes a droplet off the glass for good: its spot turns clear, fading back to droplet-free mist. */
  const takeDrop = useCallback((x: number, y: number, rx: number, ry: number) => {
    for (const g of [swept.current?.getContext("2d"), clearness.current?.mark()]) if (g) sweep(g, x, y, rx, ry);
    sweptAny.current = true;
  }, []);

  /** Ends a run at progress s: its trail so far joins the swept glass; `rest` leaves the drop where it stopped. */
  const endDrip = useCallback((d: Drip, s: number, rest: boolean) => {
    if (!d.leftSpot) {
      d.leftSpot = true;
      takeDrop(d.x0, d.y0, ...dripSpot(d));
    }
    const trail = trailPath(d, s);
    for (const g of [swept.current?.getContext("2d"), clearness.current?.mark()]) {
      if (!g) continue;
      g.filter = `blur(${Math.max(1, d.r * TRAIL_SOFT)}px)`;
      g.fillStyle = "#000";
      g.fill(trail);
      g.filter = "none";
    }
    sweptAny.current = true;
    const fade = geom.current.fade;
    if (rest && restDrops.current && painter.current && fade) {
      const end = dripAt(d, s);
      const hide = mixHide(hides.current, thickSrc.current ? thick.current : 0);
      paintDrop(restDrops.current.mark(), painter.current, d, end, d.e, hide, fadeAt(fade, restDrops.current.size, end.x, end.y));
      rested.current.push({ d, at: end });
    }
    drips.current = drips.current.filter((x) => x !== d);
  }, [takeDrop]);

  // A new cover goes up in place of a frozen copy of what was on screen (scene and glass), which then fades away.
  const prevRef = useRef<HTMLDivElement>(null);
  const shownArt = useRef<LoadedArt | null>(null);
  const frozen = useRef(false);
  const thawToken = useRef(0);
  const freeze = useCallback(() => {
    const wrap = prevRef.current;
    const scene = baseRef.current;
    const glass = fogRef.current;
    if (!wrap || !scene || !glass?.width) return;
    const [pb, pg] = Array.from(wrap.children) as HTMLCanvasElement[];
    pb.width = scene.width;
    pb.height = scene.height;
    pb.getContext("2d")!.drawImage(scene, 0, 0);
    Object.assign(pb.style, holdTransform(getComputedStyle(scene))); // the scene's push-in, held exactly where it is
    pg.width = glass.width;
    pg.height = glass.height;
    pg.getContext("2d")!.drawImage(glass, 0, 0);
    Object.assign(pg.style, { left: glass.style.left, top: glass.style.top, width: glass.style.width, height: glass.style.height });
    wrap.style.transition = "none";
    wrap.style.opacity = "1";
    wrap.getBoundingClientRect(); // applies it now, so thaw() in the same task still fades from it
    frozen.current = true;
  }, []);
  const thaw = useCallback(() => {
    const wrap = prevRef.current;
    if (!wrap || !frozen.current) return;
    frozen.current = false;
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wrap.style.transition = instant ? "none" : "opacity 600ms ease";
    wrap.style.opacity = "0";
    const token = ++thawToken.current;
    window.setTimeout(() => {
      if (token !== thawToken.current || frozen.current) return;
      for (const c of Array.from(wrap.children) as HTMLCanvasElement[]) c.width = c.height = 0; // free the copies
    }, instant ? 0 : 650);
  }, []);

  /** Draws the title and artist as if written with a fingertip on the fogged glass (see fingerWriting()). */
  const { text, font, textSize, finger, textAngle, textX, textY, textDrips, dripWidth, spacing } = p;
  const visibility = useRef(p.visibility);

  /**
   * Text visibility: compare the clear view and the fog under the strokes; if they're too alike (flat or plain covers),
   * thicken the fog around the text towards a tone that contrasts (lighter over dark covers, darker grey over light
   * ones), just enough to reach the target difference set by Text visibility.
   */
  const updateHaze = useCallback(() => {
    const w = writing.current;
    const fogC = fogSrc.current;
    const clearC = clearSrc.current;
    if (!w || !fogC || !clearC || !w.samples.length || fogC.width !== w.clear.width) {
      haze.current = null;
      return;
    }
    const size = fogC.width;
    const fogPx = fogC.getContext("2d")!.getImageData(0, 0, size, size).data;
    const clearPx = clearC.getContext("2d")!.getImageData(0, 0, size, size).data;
    const lum = (d: Uint8ClampedArray, i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    let lf = 0;
    let lc = 0;
    const tint = [0, 0, 0];
    for (const p of w.samples) {
      lf += lum(fogPx, p * 4);
      lc += lum(clearPx, p * 4);
      for (let k = 0; k < 3; k++) tint[k] += fogPx[p * 4 + k];
    }
    lf /= w.samples.length;
    lc /= w.samples.length;
    const target = 0.32 * visibility.current; // wanted brightness difference between fog and cleared strokes
    // Veil tone: the fog's own colour pushed lighter (dark covers) or darker (light covers).
    const lighter = lc < 0.5;
    const veil = tint.map((v) => {
      const m = v / w.samples.length;
      return lighter ? m + (235 - m) * 0.75 : m * 0.35;
    });
    const lv = (0.2126 * veil[0] + 0.7152 * veil[1] + 0.0722 * veil[2]) / 255;
    const want = lighter ? lc + target : lc - target;
    const reach = (want - lf) / (lv - lf || 1e-3);
    const alpha = Math.max(0, Math.min(0.8, Math.abs(lf - lc) >= target ? 0 : reach));
    if (alpha <= 0.01) {
      haze.current = null;
      return;
    }
    // The patch: the text's box, padded and very soft, so it reads as thicker fog rather than a shape.
    const pad = w.fontPx * 0.7;
    const shape = document.createElement("canvas");
    shape.width = shape.height = size;
    const sc = shape.getContext("2d")!;
    sc.filter = `blur(${w.fontPx * 0.45}px)`;
    sc.fillStyle = `rgb(${veil.map(Math.round).join(",")})`;
    sc.beginPath();
    sc.roundRect(w.box.x0 - pad, w.box.y0 - pad, w.box.x1 - w.box.x0 + 2 * pad, w.box.y1 - w.box.y0 + 2 * pad, pad);
    sc.fill();
    haze.current = { layer: shape, alpha };
  }, []);
  // Visibility only re-measures the haze; it doesn't rewrite the text (which would restart its fog-return clock).
  useEffect(() => {
    visibility.current = p.visibility;
    updateHaze();
    compose();
  }, [updateHaze, compose, p.visibility]);
  const write = useCallback(async (restartClock: boolean) => {
    const { cover, pad, q } = geom.current;
    if (!cover) return;
    if (!text) {
      writing.current = null;
      return;
    }
    const face = FOG_FONTS[Math.round(font)] ?? FOG_FONTS[0];
    const next = await fingerWriting({ size: cover + 2 * pad, cover, pad, q, title: song.title, artist: song.artist, face, textSize, finger, angle: textAngle, x: textX, y: textY, drips: textDrips, dripWidth, spacing });
    writing.current = next;
    // Freshly written text starts clear; the fog then creeps back over it (if Text fogs over is set).
    if (restartClock || !writtenAt.current) writtenAt.current = performance.now();
  }, [song.title, song.artist, text, font, textSize, finger, textAngle, textX, textY, textDrips, dripWidth, spacing]);

  // Rewrite (cheap) when the text settings change; recompose when only the clarity changes.
  useEffect(() => {
    if (!built.current) return;
    let live = true;
    write(true).then(() => {
      if (!live) return;
      updateHaze();
      compose();
    });
    return () => {
      live = false;
    };
  }, [write, compose, updateHaze]);
  useEffect(() => {
    clarity.current = p.clarity;
    compose();
  }, [compose, p.clarity]);

  // Fog returning over the writing: eases from clear to fully fogged over `textRefog` seconds (0 = never). Recomposed
  // ~15 times a second, which is plenty for a change this slow.
  useEffect(() => {
    if (!p.textRefog) {
      textFog.current = 1;
      compose();
      return;
    }
    // Keeps ticking while enabled (rewriting the text restarts its clock at any time); only recomposes on change.
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 66) {
        last = now;
        const t = Math.min(1, Math.max(0, (now - writtenAt.current) / (p.textRefog * 1000)));
        const next = 1 - t * t * (3 - 2 * t);
        if (Math.abs(next - textFog.current) > 0.002) {
          textFog.current = next;
          compose();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compose, p.textRefog]);

  const { density, opacity, blur, bloom, drops, dropSize, refraction, trails, patchiness, brightness, glow, bleed, edgeSoft, thickMax } = p;
  const thickOn = p.thicken > 0;
  const buildGen = useRef(0);
  const sized = useRef<{ W: number; H: number; dpr: number; wide: boolean } | null>(null); // what the last build was for
  const lastCover = useRef<{ art: LoadedArt | null; at: number }>({ art: null, at: 0 }); // the latest cover asked for, and when
  const held = useRef(hold);
  const released = useRef<(() => void)[]>([]); // new covers made and waiting for `hold` to go off
  useEffect(() => {
    held.current = hold;
    if (!hold) for (const go of released.current.splice(0)) go();
  }, [hold]);
  // The panes render in background workers (fog-client.ts), the plain and the thick one in parallel.
  const renderers = useRef<{ base: ReturnType<typeof createFogRenderer>; thick: ReturnType<typeof createFogRenderer> } | null>(null);
  useEffect(() => {
    const r = { base: createFogRenderer(), thick: createFogRenderer() };
    renderers.current = r;
    return () => {
      r.base.dispose();
      r.thick.dispose();
      if (renderers.current === r) renderers.current = null;
    };
  }, []);
  useEffect(() => {
    const build = async () => {
      const r = renderers.current;
      if (!r) return;
      // The backdrop's own size (100lvh tall: steady on phones as the toolbars come and go), and the layout CSS uses.
      const { W, H } = backdropSize(baseRef.current!);
      const dpr = window.devicePixelRatio || 1;
      sized.current = { W, H, dpr, wide: wideNow() };
      const f = coverFrame(W, H, layout, sized.current.wide);
      // Full screen: no edge bleed (the cover already fills the window), at most ~1600 px a side, and droplets drawn to
      // look as they do on song pages. Touch screens (phones, tablets) render the soft fog at most 1 px per CSS px: a
      // third of the pixels of a 1.5× pane, so far less memory and work, and it still reads as mist.
      const qMax = coarseNow() ? 1 : 1.5;
      const q = f.fill ? Math.min(qMax, dpr, 1600 / f.side) : Math.min(qMax, dpr);
      const coverPx = Math.round(f.side * q);
      const edge = f.fill ? 0 : bleed; // CSS px: the fogged pane runs this far past the cover and fades out
      const pad = Math.round(edge * q);
      const size = coverPx + 2 * pad;
      const tuned = { density, opacity, blur, bloom, drops, dropSize, refraction, trails, patchiness, brightness, seed: pane };
      const params = f.fill ? fillParams(tuned, fillDropScale(W, H, bleed)) : tuned;
      const src = padCover(art.img, coverPx, pad, edgeSoft * q);
      // Render off the main thread; what's on screen stays, drops still running, until the new panes arrive (a newer
      // build drops this one). Once the pane has thickened, a new cover waits for its thick pane too, so the fog doesn't
      // thin out while that's on its way.
      const gen = ++buildGen.current;
      const newCover = shownArt.current !== art;
      const thickJob = thickOn ? r.thick.render({ src, size, scale: q, params: thickened(params, thickMax) }) : null;
      const waitThick = newCover && thick.current > 0 ? thickJob : null;
      const [out, thicker] = await Promise.all([r.base.render({ src, size, scale: q, params }), waitThick]);
      if (!out || gen !== buildGen.current) return;
      if (newCover && held.current) {
        await new Promise<void>((go) => released.current.push(go));
        if (gen !== buildGen.current) return;
      }
      if (shownArt.current && newCover) freeze();
      const { ctx } = fitCanvas(baseRef.current!);
      painter.current = dropPainter(src, size, params);
      hides.current = { base: opacity * 0.92, thick: thickened(params, thickMax).opacity * 0.92 };
      const layer = (data: Uint8ClampedArray<ArrayBuffer>) => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const o = c.getContext("2d")!;
        o.putImageData(new ImageData(data, size, size), 0, 0);
        feather(o, f.wide, size, pad, f.fill);
        return c;
      };
      // Underneath: the clear (dimmed) cover, with the same bleed.
      const span = f.side + 2 * edge;
      drawBleed(ctx, art, f, W, H, glow);
      clearSrc.current = layer(out.clear);
      ctx.drawImage(clearSrc.current, f.ox - edge, f.oy - edge, span, span);
      fogSrc.current = layer(out.fog);
      mistSrc.current = layer(out.mist);
      // Keep earlier wipes and run trails across rebuilds, resizes and bleed changes, pinned to the cover.
      const was = geom.current;
      const carry = (old: FadingLayer | null) => {
        if (old && old.size === size && was.pad === pad) return old;
        if (!old || !was.cover) return new FadingLayer(size);
        const k = coverPx / was.cover;
        return old.carried(size, k, pad - was.pad * k);
      };
      const carryCanvas = (old: HTMLCanvasElement | null) => {
        if (old && old.width === size && was.pad === pad) return old;
        const m = blank(size);
        if (old && was.cover) {
          const k = coverPx / was.cover;
          m.getContext("2d")!.drawImage(old, pad - was.pad * k, pad - was.pad * k, old.width * k, old.height * k);
        }
        return m;
      };
      mask.current = carry(mask.current);
      clearness.current = carry(clearness.current);
      restDrops.current = carry(restDrops.current);
      swept.current = carryCanvas(swept.current);
      // Drops mid-run carry on over a new cover, but not into a new layout (a resize): they're in the old one's pixels.
      if (coverPx !== was.cover || pad !== was.pad) {
        drips.current = [];
        const k = coverPx / was.cover;
        const shift = pad - was.pad * k;
        rested.current = was.cover ? rested.current.map(({ d, at }) => ({ d, at: { x: at.x * k + shift, y: at.y * k + shift, r: at.r * k } })) : [];
      }
      allDrops.current = fogDrops(params);
      geom.current = { cover: coverPx, pad, q, fade: fadeStops(f.wide, size, pad, f.fill) };
      for (const c of [fogRef.current!, dropsRef.current!]) {
        c.width = c.height = size;
        Object.assign(c.style, { left: `${f.ox - edge}px`, top: `${f.oy - edge}px`, width: `${span}px`, height: `${span}px` });
      }
      // The thick pane: a new cover's own if it came along, else none until it lands. Settings changes keep the previous
      // one meanwhile, stretched to the new size.
      const setThick = (t: FogResult | null) => {
        thickSrc.current = t && layer(t.fog);
        thickMistSrc.current = t && layer(t.mist);
      };
      if (!thickJob || waitThick) setThick(thicker);
      else if (newCover) setThick(null);
      // The drops runs left on the glass see the new cover through them, each still as strong as it was.
      if (newCover) {
        const rd = restDrops.current;
        rested.current = rested.current.filter(({ at }) => rd.alphaAt(Math.round(at.x), Math.round(at.y)) > 0);
        const hide = mixHide(hides.current, thickSrc.current ? thick.current : 0);
        if (rested.current.length) rd.repaint((g) => rested.current.forEach(({ d, at }) => paintDrop(g, painter.current!, d, at, d.e, hide, 1)));
      }
      compose();
      built.current = true;
      void write(false).then(() => {
        updateHaze();
        compose();
      });
      shownArt.current = art;
      thaw();
      if (thickJob && !waitThick)
        void thickJob.then((t) => {
          if (!t || gen !== buildGen.current) return;
          setThick(t);
          compose();
        });
    };
    // Slider drags and window resizes settle before rebuilding, and so do covers coming quicker than that (a key held
    // down on the landing wheel); any other new cover starts at once.
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void build(), 80);
    };
    const now = performance.now();
    const coverNow = art !== lastCover.current.art && now - lastCover.current.at > 80;
    if (art !== lastCover.current.art) lastCover.current = { art, at: now };
    if (built.current && !coverNow) schedule();
    else void build();
    // Rebuilt only when the backdrop really changes: its size (a window resized, a device turned), the layout, or the
    // screen's pixel density (a window moved to another display). Not as a phone's toolbars come and go.
    const resized = () => {
      const s = sized.current;
      const { W, H } = baseRef.current ? backdropSize(baseRef.current) : { W: 0, H: 0 };
      if (!s || s.W !== W || s.H !== H || s.dpr !== (window.devicePixelRatio || 1) || s.wide !== wideNow()) schedule();
    };
    const observer = new ResizeObserver(resized);
    if (baseRef.current?.parentElement) observer.observe(baseRef.current.parentElement);
    let dppx = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onDppx = () => {
      dppx.removeEventListener("change", onDppx);
      dppx = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dppx.addEventListener("change", onDppx);
      resized();
    };
    dppx.addEventListener("change", onDppx);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      dppx.removeEventListener("change", onDppx);
    };
  }, [art, layout, compose, write, updateHaze, freeze, thaw, density, opacity, blur, bloom, drops, dropSize, refraction, trails, patchiness, brightness, pane, glow, bleed, edgeSoft, thickOn, thickMax]);

  // Wiping. With a mouse: click and drag. With a finger (or pen): press and hold still for a moment (HOLD_MS), then
  // drag; a quick drag stays the page's (it scrolls a song page, it turns the landing wheel). A hold works over the
  // song's title and artist too (on phones they sit on the fog), not on controls. The backdrop ignores the pointer, so
  // follow it at the window and map it onto the fog.
  useEffect(() => {
    let last: { x: number; y: number } | null = null;
    let wiping: number | null = null; // the pointer that's wiping
    let hold: { id: number; x: number; y: number; timer: number; at: PointerEvent; due: number } | null = null;
    // A finger wiping after a hold: where it pressed, and when (event time) the hold was complete. A busy page can handle
    // a drag's first moves late, after the hold's timer; their own timestamps still tell that the finger moved before
    // the hold was up, so it was a drag after all: the wipe stands down and the page (or the wheel) has the touch.
    let held: { x: number; y: number; due: number } | null = null;
    const root = document.documentElement;
    const locate = (e: { clientX: number; clientY: number }) => {
      const c = fogRef.current;
      const m = mask.current;
      if (!c || !m) return null;
      const rect = c.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * m.size;
      const y = ((e.clientY - rect.top) / rect.height) * m.size;
      const inside = x >= 0 && y >= 0 && x <= m.size && y <= m.size;
      return { m, x, y, r: (p.brush / 2) * (m.size / rect.width), inside };
    };
    const onControls = (e: PointerEvent) => e.target instanceof Element && !!e.target.closest("button, input, select, textarea, a, [role=dialog], [data-backdrop-ui]");
    const stamp = (m: FadingLayer, x: number, y: number, r: number) => {
      const ctx = m.mark();
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(Math.min(0.99, 1 - p.softness), "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const wipeTo = (at: NonNullable<ReturnType<typeof locate>>) => {
      // Stamp along the path so fast strokes stay continuous.
      const from = last ?? at;
      const steps = Math.max(1, Math.ceil(Math.hypot(at.x - from.x, at.y - from.y) / (at.r * 0.25)));
      for (let i = 1; i <= steps; i++) stamp(at.m, from.x + ((at.x - from.x) * i) / steps, from.y + ((at.y - from.y) * i) / steps, at.r);
      last = { x: at.x, y: at.y };
      // Wiping wins over running drops: one the stroke touches is wiped away, mid-run (its trail so far stays).
      for (const d of drips.current) {
        const s = dripProgress(d, performance.now());
        const o = dripAt(d, s);
        if (segmentDistance(o.x, o.y, from.x, from.y, at.x, at.y) < at.r + o.r) endDrip(d, s, false);
      }
      compose();
    };
    const noSelect = (on: boolean) => {
      root.style.userSelect = on ? "none" : "";
      root.style.webkitUserSelect = on ? "none" : "";
    };
    const endHold = () => {
      if (hold) clearTimeout(hold.timer);
      hold = null;
      if (wiping === null) noSelect(false);
    };
    const movedEarly = (x: number, y: number, t: number) => !!held && t <= held.due && Math.hypot(x - held.x, y - held.y) > HOLD_SLOP;
    const standDown = () => {
      if (wiping !== null) release(wiping);
      wiping = null;
      held = null;
      last = null;
      noSelect(false);
    };
    const onDown = (e: PointerEvent) => {
      if (onControls(e)) return;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        const at = locate(e);
        if (!at?.inside) return;
        e.preventDefault(); // no text selection while wiping
        wiping = e.pointerId;
        root.style.cursor = "grabbing";
        wipeTo(at);
        return;
      }
      if (!e.isPrimary || hold || wiping !== null || !locate(e)?.inside) return;
      noSelect(true); // a held finger mustn't start selecting the title instead
      const id = e.pointerId;
      // Timed from the touch itself (its timestamp), not from when the page got round to handling it.
      const due = e.timeStamp + HOLD_MS;
      const timer = window.setTimeout(() => {
        const h = hold;
        hold = null;
        if (!h || !claim(id, "fog")) return noSelect(false); // the wheel took it (a drag) first
        wiping = id;
        held = { x: h.x, y: h.y, due: h.due };
        navigator.vibrate?.(8); // a tick where there's one to give (Android): wiping has begun
        const at = locate(h.at);
        if (at) wipeTo(at);
      }, Math.max(0, due - performance.now()));
      hold = { id, x: e.clientX, y: e.clientY, timer, at: e, due };
    };
    const onMove = (e: PointerEvent) => {
      if (hold && e.pointerId === hold.id) {
        if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP) endHold(); // a drag: scrolling, or the wheel
        else hold.at = e;
        return;
      }
      if (wiping === null) {
        // A grab hand over the fog says it can be wiped.
        if (e.pointerType === "mouse") root.style.cursor = locate(e)?.inside && !onControls(e) ? "grab" : "";
        return;
      }
      if (e.pointerId !== wiping) return;
      if (movedEarly(e.clientX, e.clientY, e.timeStamp)) return standDown();
      const at = locate(e);
      if (at) wipeTo(at);
    };
    const onUp = (e: PointerEvent) => {
      if (hold && e.pointerId === hold.id) endHold();
      if (e.pointerId !== wiping) return;
      wiping = null;
      held = null;
      last = null;
      if (e.pointerType === "mouse") root.style.cursor = "grab";
      else {
        release(e.pointerId);
        noSelect(false);
      }
    };
    // While a finger wipes, the page mustn't scroll under it (the browser would take the touch away): its touchmoves are
    // cancelled. Such a listener has to say so up front (passive: false); it only cancels while wiping.
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (wiping !== null && t && movedEarly(t.clientX, t.clientY, e.timeStamp)) return standDown();
      if (wiping !== null && e.cancelable) e.preventDefault();
    };
    // A long press can bring up the browser's menu (Android) or a text selection: not while holding or wiping.
    const onContextMenu = (e: Event) => {
      if (hold || wiping !== null) e.preventDefault();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      endHold();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu);
      root.style.cursor = "";
      noSelect(false);
    };
  }, [compose, endDrip, p.brush, p.softness]);

  // Fog creeping back over the wipes in `refog` seconds (0 = never), with no visible steps (see FadingLayer).
  useEffect(() => {
    if (!p.refog) return;
    return fadeLoop(() => [mask.current], p.refog, compose);
  }, [compose, p.refog]);

  // The pane starts out freshly fogged when first shown. A song changing in place (the landing page) keeps the same
  // glass, wipes, trails, drops and thickening and all; only the cover behind it changes (see build).
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  // Fogging up: eases the thick pane in over `thicken` seconds from when the pane was first shown (0 = never),
  // recomposing a few times a second, which is plenty for a change this slow.
  useEffect(() => {
    if (!p.thicken) {
      thick.current = 0;
      compose();
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 250) {
        last = now;
        const t = Math.min(1, Math.max(0, (now - shownAt.current) / (p.thicken * 1000)));
        const next = t * t * (3 - 2 * t);
        if (Math.abs(next - thick.current) > 0.003) {
          thick.current = next;
          compose();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compose, p.thicken]);

  useEffect(() => {
    dropLook.current = { film: 0.3 + 0.5 * p.opacity }; // the film the baked trails keep
  }, [p.opacity]);

  // Drops running down: the first starts 1.5–3 s after the pane is shown, then one at most every `dripEvery` seconds
  // (start to start, 1–2× that apart; several run at once when they start closer together than they last), picked from the
  // larger droplets on the cover that haven't run and aren't wiped away, bigger ones far likelier (by volume, r³). One
  // run in three goes all the way down, off the bottom edge of the pane; the others stop on the glass. Off for reduced
  // motion.
  useEffect(() => {
    if (!p.autoDrips || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gap = () => p.dripEvery * 1000 * (1 + Math.random());
    const toBottom = oneInThree();
    let next = performance.now() + 1500 + Math.random() * 1500;
    let raf = 0;
    const start = (now: number) => {
      const fogC = fogRef.current;
      const size = fogC?.width ?? 0;
      const { cover, pad, fade } = geom.current;
      if (!fogC || !swept.current || !cover || !fade || mask.current?.size !== size) return false;
      const w = writing.current;
      const nearText = (x: number, y: number) => !!w && x > w.box.x0 - w.fontPx && x < w.box.x1 + w.fontPx && y > w.box.y0 - w.fontPx && y < w.box.y1 + w.fontPx;
      const shown = fogC.getContext("2d")!;
      const lo = pad / size;
      const span = cover / size;
      const pool = allDrops.current.filter((d) => d.canRun && !gone.current.has(d.i) && d.x > lo + span * 0.04 && d.x < lo + span * 0.96 && d.y > lo + span * 0.03 && d.y < lo + span * 0.7);
      for (let tries = 0; tries < 6 && pool.length; tries++) {
        let t = Math.random() * pool.reduce((sum, d) => sum + d.rd ** 3, 0);
        const k = pool.findIndex((d) => (t -= d.rd ** 3) <= 0);
        const d = pool.splice(k < 0 ? pool.length - 1 : k, 1)[0];
        const x = d.x * size;
        const y = d.y * size;
        // Only a droplet that shows as it should: not where the fog fades out, not under the writing, and not wiped or
        // swept away (the fog canvas there is as opaque as its edge fade allows).
        const edge = fadeAt(fade, size, x, y);
        if (edge < 0.5 || nearText(x, y) || shown.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] < 255 * edge * 0.85) continue;
        gone.current.add(d.i);
        const full = toBottom();
        const len = full ? size + d.rd * size * 1.5 - y : Math.min(cover * (0.15 + Math.random() * 0.25), pad + cover * 0.97 - y);
        const run = newDrip(x, y, d.rd * size, len, now, cover, !full, { e: d.e, wob: d.wob, ph: d.ph });
        run.absorb = pathDrops(run, allDrops.current.filter((o) => !gone.current.has(o.i)), size, d.i);
        drips.current.push(run);
        return true;
      }
      return false;
    };
    const tick = (now: number) => {
      const running = drips.current;
      for (const d of running) {
        const s = dripProgress(d, now);
        // Its spot is swept once it has moved off it; until then it covers its old self exactly.
        if (!d.leftSpot && s * d.len >= d.r * 0.6) {
          d.leftSpot = true;
          takeDrop(d.x0, d.y0, ...dripSpot(d));
        }
        // Droplets in its path go as it reaches them.
        while (d.absorb[d.taken] && d.absorb[d.taken].s <= s + d.r / d.len) {
          const o = d.absorb[d.taken++];
          takeDrop(o.x, o.y, o.rx, o.ry);
          gone.current.add(o.i);
        }
        if (s >= 1) endDrip(d, 1, d.rests); // replaces drips.current; `running` stays as it was
      }
      if (now >= next && built.current) next = start(now) ? now + gap() : now + 2000;
      if (running.length) compose();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      drips.current = [];
      compose();
    };
  }, [compose, endDrip, takeDrop, p.autoDrips, p.dripEvery]);

  // Run trails and their water fog over again in `dripFade` seconds (0 = never), as smoothly as the wipes.
  useEffect(() => {
    if (!p.dripFade) return;
    // FadingLayer's seconds are a time constant (about a third is left after them); a third of the setting leaves ~3%
    // at the set time, so the trail has fogged over by then, as the label says.
    return fadeLoop(() => [clearness.current, restDrops.current], p.dripFade / 3, compose);
  }, [compose, p.dripFade]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Only the scene behind the pane drifts; the fogged glass (and its wipes) stays put. */}
      <canvas ref={baseRef} className="animate-subtle-zoom h-full w-full" style={{ ...zoomStyle(p), transformOrigin: zoomOrigin(layout) }} />
      <canvas ref={fogRef} className="absolute" />
      <div ref={prevRef} aria-hidden className="pointer-events-none absolute inset-0 opacity-0">
        <canvas className="absolute inset-0 h-full w-full" />
        <canvas className="absolute" />
      </div>
      <canvas ref={dropsRef} className="absolute" />
    </div>
  );
}

const blank = (size: number) => Object.assign(document.createElement("canvas"), { width: size, height: size });

/**
 * A mask or overlay (wipes, run trails, the water runs left) that fades away over time without visible steps. Canvas
 * alpha is 8-bit, so small fades round away and have to be applied in steps, which the eye sees as the fog returning
 * layer by layer. Here the fade is applied to `aged` in 25% steps, and between steps `aged` is drawn with an alpha
 * that eases towards the next one, so each applied step lands where the eye already is. New marks go to `fresh` at
 * full strength and join `aged` at the next step. Once nothing could show more than 0.4%, it's cleared outright (no
 * faint traces of old wipes).
 */
class FadingLayer {
  aged: HTMLCanvasElement;
  fresh: HTMLCanvasElement;
  private pending = 0; // fade accrued since the last applied step
  private left = 0; // the most any mark can still show: 1 after a new one, 0 when there's nothing
  private marked = false; // `fresh` has marks not yet joined to `aged`

  constructor(readonly size: number) {
    this.aged = blank(size);
    this.fresh = blank(size);
  }

  /** The context to draw new marks with. */
  mark() {
    this.marked = true;
    this.left = 1;
    return this.fresh.getContext("2d")!;
  }

  get live() {
    return this.left > 0;
  }

  /** Accrues `ms` of fading at 1/`seconds` per second (each applied share multiplies what's left, as it always has). */
  advance(ms: number, seconds: number) {
    if (!this.live) return;
    this.pending += ms / 1000 / seconds;
    if (this.pending < 0.25) return;
    const a = Math.min(1, this.pending);
    const g = this.aged.getContext("2d")!;
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(0, 0, this.size, this.size);
    g.globalCompositeOperation = "source-over";
    this.left *= 1 - a;
    if (this.marked) {
      g.drawImage(this.fresh, 0, 0);
      this.fresh.getContext("2d")!.clearRect(0, 0, this.size, this.size);
      this.marked = false;
      this.left = 1;
    }
    this.pending = 0;
    if (this.left < 0.004) this.clear();
  }

  /** Draws the layer with the context's current composite operation and alpha. */
  drawOn(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.live) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (1 - this.pending);
    ctx.drawImage(this.aged, 0, 0, w, h);
    ctx.globalAlpha = a;
    if (this.marked) ctx.drawImage(this.fresh, 0, 0, w, h);
  }

  /** How strongly (x, y) is marked, 0–255. */
  alphaAt(x: number, y: number) {
    const at = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
    return this.live ? Math.max(at(this.aged) * (1 - this.pending), this.marked ? at(this.fresh) : 0) : 0;
  }

  /** The same marks in new colours: `paint` draws them all again at full strength; each keeps how strongly it shows. */
  repaint(paint: (g: CanvasRenderingContext2D) => void) {
    if (!this.live) return;
    const full = blank(this.size);
    paint(full.getContext("2d")!);
    for (const c of [this.aged, this.fresh]) {
      const g = c.getContext("2d")!;
      g.globalCompositeOperation = "source-in"; // the new colour, at the alpha that was there
      g.drawImage(full, 0, 0);
      g.globalCompositeOperation = "source-over";
    }
  }

  clear() {
    for (const c of [this.aged, this.fresh]) c.getContext("2d")!.clearRect(0, 0, this.size, this.size);
    this.pending = 0;
    this.left = 0;
    this.marked = false;
  }

  /** The same marks on a layer of another size, scaled by `k` and shifted by `shift` px (to stay pinned to the cover). */
  carried(size: number, k: number, shift: number) {
    const next = new FadingLayer(size);
    for (const [from, to] of [[this.aged, next.aged], [this.fresh, next.fresh]]) to.getContext("2d")!.drawImage(from, shift, shift, from.width * k, from.height * k);
    Object.assign(next, { pending: this.pending, left: this.left, marked: this.marked });
    return next;
  }
}

/**
 * Runs the fade of some layers, recomposing while any of them still shows: often enough that each recompose changes
 * the fade by at most ~0.5% (up to every frame for short fades), and once more when one finishes. Returns the stop.
 */
function fadeLoop(layers: () => (FadingLayer | null)[], seconds: number, compose: () => void) {
  const every = Math.min(100, Math.max(0, seconds * 5)); // ms per 0.5% of fade
  let raf = 0;
  let prev = performance.now();
  let drawn = 0;
  const tick = (now: number) => {
    const live = layers().filter((l): l is FadingLayer => !!l?.live);
    for (const l of live) l.advance(now - prev, seconds);
    prev = now;
    const finished = live.some((l) => !l.live);
    if (live.length && (finished || now - drawn >= every)) {
      drawn = now;
      compose();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Marks all a droplet covers (plus a margin) on the swept or clearness layer; the soft edge falls outside it. */
function sweep(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  const [a, b] = sweepRadii(rx, ry);
  const soft = Math.max(0.5, rx * 0.1);
  g.filter = `blur(${soft}px)`;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(x, y, a + 2 * soft, b + 2 * soft, 0, 0, Math.PI * 2);
  g.fill();
  g.filter = "none";
}

/** The trail cleared from the start to progress s, a little narrower than the drop. */
function trailPath(d: Drip, s: number) {
  const n = Math.max(2, Math.ceil((s * d.len) / 3));
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const at = dripAt(d, (s * i) / n);
    const hw = at.r * TRAIL_HALF;
    left.push([at.x - hw, at.y]);
    right.push([at.x + hw, at.y]);
  }
  const path = new Path2D();
  path.moveTo(...left[0]);
  for (const pt of [...left.slice(1), ...right.reverse()]) path.lineTo(...pt);
  path.closePath();
  return path;
}

const mixHide = (h: { base: number; thick: number }, thickness: number) => h.base + (h.thick - h.base) * thickness;

let spriteCanvas: HTMLCanvasElement | null = null;

/**
 * Draws a drop with the droplet painter (so it looks exactly as its droplet was baked into the fog) at its current
 * place and size, `e` its elongation, at `alpha` (the fog layer's edge fade there).
 */
function paintDrop(ctx: CanvasRenderingContext2D, paint: ReturnType<typeof dropPainter>, d: Drip, at: { x: number; y: number; r: number }, e: number, hide: number, alpha: number) {
  const ry = at.r * e;
  const box = Math.ceil(Math.max(at.r, ry) * (1 + d.wob * 1.5) + 2);
  const w = 2 * box + 1;
  const ox = Math.floor(at.x) - box;
  const oy = Math.floor(at.y) - box;
  const img = new ImageData(w, w);
  paint({ cx: at.x, cy: at.y, rx: at.r, ry, wob: d.wob, ph: d.ph }, hide, img.data, w, w, ox, oy, false);
  if (!spriteCanvas || spriteCanvas.width < w) spriteCanvas = blank(Math.max(w, 64));
  const g = spriteCanvas.getContext("2d")!;
  g.clearRect(0, 0, w, w);
  g.putImageData(img, 0, 0);
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(spriteCanvas, 0, 0, w, w, ox, oy, w, w);
  ctx.globalAlpha = before;
}

type Face = (typeof FOG_FONTS)[number];

/** Seeded PRNG, so the hand-wobble and drips stay put while other settings change. */
function seeded(seed: number) {
  let v = seed;
  const next = () => ((v = (v * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 4; i++) next(); // small seeds give tiny first values; skip them
  return next;
}

/**
 * Title and artist written into the fog with a fingertip, as two canvases the size of the fog layer:
 *  - clear: where the finger wiped (glyphs thickened into round-ended strokes, a little wobbly, plus drips that ran
 *    down from the bottoms of some letters);
 *  - ridges: the water the finger pushed aside, as small beads scattered along the stroke edges, and a bead at the end
 *    of each drip.
 */
async function fingerWriting(o: {
  size: number;
  cover: number;
  pad: number;
  q: number;
  title: string;
  artist: string;
  face: Face;
  textSize: number;
  finger: number;
  angle: number;
  x: number;
  y: number;
  drips: number;
  dripWidth: number;
  spacing: number;
}) {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = o.size;
    return c;
  };
  // Resolve the app's next/font families (CSS variables) to real names for the canvas.
  const css = getComputedStyle(document.documentElement);
  const family = o.face.family.replace(/var\((--[\w-]+)\)/g, (_, v: string) => css.getPropertyValue(v).trim() || "serif");
  const titleSize = o.cover * 0.12 * o.textSize;
  await Promise.all([document.fonts.load(`${o.face.weight} ${titleSize}px ${family}`, o.title), document.fonts.load(`${o.face.weight} ${titleSize}px ${family}`, o.artist)]).catch(() => {});

  // 1. The glyphs, letter by letter with a little wobble, the block tilted by `angle` around its centre.
  const glyphs = make();
  const g = glyphs.getContext("2d")!;
  const rand = seeded(9001);
  const lines = [
    { text: o.title, size: titleSize },
    { text: o.artist, size: titleSize * 0.55 },
  ];
  // Fit the longest line to ~78% of the cover.
  // Line width with the extra letter spacing (o.spacing is in ems).
  const widthOf = (l: (typeof lines)[number]) => {
    g.font = `${o.face.weight} ${l.size}px ${family}`;
    return g.measureText(l.text).width + o.spacing * l.size * Math.max(0, [...l.text].length - 1);
  };
  const widest = Math.max(...lines.map(widthOf));
  const fit = Math.min(1, (o.cover * 0.78) / Math.max(1, widest));
  const cx = o.pad + o.cover * o.x;
  const cy = o.pad + o.cover * o.y;
  const bottoms: { x: number; y: number; w: number; size: number; line: number }[] = [];
  g.translate(cx, cy);
  g.rotate((o.angle * Math.PI) / 180);
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";
  let y = -lines[0].size * fit * 0.25;
  for (const [li, l] of lines.entries()) {
    const fs = l.size * fit;
    g.font = `${o.face.weight} ${fs}px ${family}`;
    const chars = [...l.text];
    const gap = o.spacing * fs;
    const total = g.measureText(l.text).width + gap * Math.max(0, chars.length - 1);
    let x = -total / 2;
    for (const ch of chars) {
      const w = g.measureText(ch).width;
      const jy = (rand() - 0.5) * fs * 0.06;
      const rot = ((rand() - 0.5) * 4 * Math.PI) / 180;
      g.save();
      g.translate(x + w / 2, y + jy);
      g.rotate(rot);
      g.fillText(ch, -w / 2, 0);
      g.restore();
      // Any letter can drip (descenders too: water gathers at their tips). Punctuation can't.
      if (/[\p{L}\p{N}]/u.test(ch)) bottoms.push({ x: x + w / 2, y: y + jy, w, size: fs, line: li });
      x += w + gap;
    }
    y += fs * 0.95 + (li === 0 ? fs * 0.2 : 0);
  }

  // 2. Thicken into fingertip strokes: stamp the glyphs around a small circle (round ends and joins, even width).
  const clear = make();
  const c = clear.getContext("2d")!;
  const r = Math.max(1, titleSize * fit * 0.035 * o.finger);
  c.filter = `blur(${Math.max(0.6, o.q * 0.8)}px)`;
  for (let k = 0; k < 16; k++) c.drawImage(glyphs, Math.cos((k / 16) * Math.PI * 2) * r, Math.sin((k / 16) * Math.PI * 2) * r);
  c.drawImage(glyphs, 0, 0);
  c.filter = "none";

  // 3. Drips: a few letters shed a run of water downwards (gravity is straight down, whatever the tilt). Each starts
  //    where that letter's stroke reaches lowest (where the water gathers), found in the drawn strokes, so every drip
  //    hangs from ink rather than from the letter's empty box.
  const rot = (o.angle * Math.PI) / 180;
  const strokes = c.getImageData(0, 0, o.size, o.size).data;
  // Where the strokes are (bounding box, and a sample of stroke pixels for measuring contrast against the fog).
  const box = { x0: o.size, y0: o.size, x1: 0, y1: 0 };
  const samples: number[] = [];
  for (let i = 0, n = 0; i < strokes.length; i += 4 * 2) {
    if (strokes[i + 3] < 200) continue;
    const p = i / 4;
    const x = p % o.size;
    const y = (p - x) / o.size;
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
    if (n++ % 7 === 0) samples.push(p);
  }
  const lowest = (lx: number, ly: number, w: number, fs: number) => {
    const px0 = cx + lx * Math.cos(rot) - ly * Math.sin(rot);
    const py0 = cy + lx * Math.sin(rot) + ly * Math.cos(rot);
    let best: { x: number; y: number } | null = null;
    for (let x = Math.max(0, Math.round(px0 - w * 0.45)); x <= Math.min(o.size - 1, Math.round(px0 + w * 0.45)); x++) {
      for (let y = Math.min(o.size - 1, Math.round(py0 + fs * 0.3)); y >= Math.max(0, Math.round(py0 - fs)); y--) {
        if (strokes[(y * o.size + x) * 4 + 3] > 200) {
          if (!best || y > best.y) best = { x, y };
          break;
        }
      }
    }
    return best;
  };
  const beads: { x: number; y: number; r: number }[] = [];
  const pick = seeded(4242);
  // Title letters first (random order), then the artist's, so short titles still get their drips.
  const order = bottoms.map((b) => ({ b, k: b.line + pick() })).sort((a, b2) => a.k - b2.k);
  c.fillStyle = "#000";
  const residue: { x: number; y: number; r: number }[] = []; // drip beads and pools (drawn, not cleared)
  const threads: { x: number; y: number; w: number }[][] = []; // drip runs, shaded dark (the water film refracts)
  // Runs are drawn on their own canvas and softened like the strokes when merged, so the joint doesn't show.
  const runs = make();
  const rn = runs.getContext("2d")!;
  rn.fillStyle = "#000";
  const starts: { x: number; y: number }[] = [];
  let dripped = 0;
  for (const { b } of order) {
    if (dripped >= Math.round(o.drips)) break;
    const start = lowest(b.x, b.y, b.w, b.size);
    // Two drips can't share a spot (touching letters can report the same lowest point).
    if (!start || starts.some((p0) => Math.hypot(p0.x - start.x, p0.y - start.y) < r * 4)) continue;
    starts.push(start);
    dripped++;
    // Modelled on real drips on misted glass: water gathers at the letter's lowest point and leaves it through a
    // flared, tapering neck, then runs as a thin thread (a fifth or less of the finger's width) almost straight
    // down. The thread is thinnest near the top (sometimes pinched almost to nothing), slightly heavier lower down, and
    // ends in a small bead with a glint. Some letters only manage a short hanging drop.
    const walk = seeded(1000 + dripped * 97 + Math.round(b.x));
    const pendant = walk() < 0.3;
    const neck = r * 3.5; // the flared meniscus where the drip leaves the letter
    const inset = r * 1.1; // the run starts inside the stroke, so the neck grows out of it
    // Lengths follow the letter height. A short hanging drop hangs a quarter to half a letter below the neck.
    const len = inset + neck + (pendant ? b.size * (0.25 + walk() * 0.25) : b.size * (0.8 + walk() * 2.2));
    // Thread radius: 14–24% of the finger's, times Drip width (1–10×). Low floor so every step of the slider shows.
    const thread = Math.max(0.5, r * (0.14 + walk() * 0.1) * o.dripWidth);
    const pinchAt = !pendant && walk() < 0.5 ? len * (0.12 + walk() * 0.3) : -1;
    const pinchLen = len * (0.06 + walk() * 0.1);
    const step = Math.max(0.6, thread * 0.5);
    // Is there ink (a stroke) here? Strokes are already wiped and wet, so a drip running into one merges with it.
    const ink = (px: number, py: number) => {
      const ix = Math.round(px);
      const iy = Math.round(py);
      return ix >= 0 && iy >= 0 && ix < o.size && iy < o.size && strokes[(iy * o.size + ix) * 4 + 3] > 200;
    };
    let x = start.x;
    let y = start.y - inset;
    let vx = 0;
    let wobble = 0;
    let t = thread; // thins each time the drip loses water to a letter it crosses
    let neckAt = Infinity; // where the current neck begins: the exit from its letter, or from another one it crossed
    let free = false; // has the drip left its own letter yet?
    let ended = false;
    const path: { x: number; y: number; w: number }[] = [];
    // The joint: water spreads wide and shallow along the letter's lower edge, curving inwards into the thread from
    // both sides (two concave curves, flat along the edge and vertical where they meet the thread). Circles can only
    // make a ball here.
    const fillet = (ex: number, ey: number, tw: number) => {
      const fw = Math.max(r * 1.8, tw * 3);
      const fh = Math.max(r * 2.4, tw * 4);
      rn.beginPath();
      rn.moveTo(ex - fw, ey - r * 0.8); // tucked inside the letter
      rn.lineTo(ex - fw, ey);
      rn.quadraticCurveTo(ex - tw, ey, ex - tw, ey + fh);
      rn.lineTo(ex + tw, ey + fh);
      rn.quadraticCurveTo(ex + tw, ey, ex + fw, ey);
      rn.lineTo(ex + fw, ey - r * 0.8);
      rn.closePath();
      rn.fill();
    };
    for (let d = 0; d < len; d += step) {
      vx = vx * 0.92 + (walk() - 0.5) * 0.05; // a faint waver, nearly vertical
      if (walk() < 0.008) vx += (walk() < 0.5 ? -1 : 1) * 0.15; // rare slight kink
      vx = Math.max(-0.25, Math.min(0.25, vx));
      x += vx * step;
      y += step;
      if (!free) {
        // Still inside its own letter: nothing to draw (already clear). The neck starts right at the exit.
        if (d > inset * 0.5 && !ink(x, y)) {
          free = true;
          neckAt = d;
          fillet(x, y, t);
        } else continue;
      } else if (ink(x, y)) {
        // Ran into another letter: its water joins that stroke. Pass through (nothing to draw: it's already clear);
        // usually it's absorbed there, otherwise enough gathers at the stroke's lower edge to break away again.
        while (ink(x, y) && d < len) {
          y += step;
          d += step;
        }
        if (walk() < 0.5 || d >= len) {
          ended = true;
          break;
        }
        t = Math.max(0.5, t * 0.8);
        neckAt = d;
        fillet(x, y, t); // it breaks away from the lower edge of the letter it crossed the same way
      }
      wobble = wobble * 0.9 + (walk() - 0.5) * 0.05;
      const heavier = 1 + 0.6 * (d / len); // water gathers as it runs
      const pinched = pinchAt >= 0 && d > pinchAt && d < pinchAt + pinchLen ? 0.4 : 1;
      // Below the joint (drawn by fillet()), the thread. It eases from exactly the joint's width to its natural
      // variation over the neck, so there's no seam.
      const settle = Math.min(1, Math.max(0, (d - neckAt) / neck));
      const width = t * (1 + (heavier * (1 + wobble * 3) * pinched - 1) * settle);
      rn.beginPath();
      rn.arc(x, y, Math.max(0.45, width), 0, Math.PI * 2);
      rn.fill();
      // Shade and gloss the free-hanging thread, growing in along the neck (no visible start where it meets a letter).
      const shadeIn = Math.min(1, Math.max(0, (d - neckAt - neck * 0.3) / (neck * 0.7)));
      if (shadeIn > 0) path.push({ x, y, w: Math.max(0.45, width) * shadeIn });
    }
    // The bead at the end: small, a little taller than wide (none if the drip was absorbed by a letter).
    if (!ended) {
      const hr = Math.max(1.2, t * (2 + walk() * 0.8));
      rn.beginPath();
      rn.ellipse(x, y + hr * 0.3, hr, hr * 1.25, 0, 0, Math.PI * 2);
      rn.fill();
      residue.push({ x, y: y + hr * 0.3, r: hr });
    }
    threads.push(path);
  }
  const lettersOnly = make(); // the strokes before the drips joined them, for placing edge beads
  lettersOnly.getContext("2d")!.drawImage(clear, 0, 0);
  c.filter = `blur(${Math.max(0.6, o.q * 0.8)}px)`; // same softness as the strokes
  c.drawImage(runs, 0, 0);
  c.filter = "none";
  beads.push(...residue);

  // 4. Edge beads: the water a finger pushes aside gathers as small, irregular beads along the stroke edges (not a
  //    continuous ridge, which reads as an outline). Find the thin band just outside the strokes and scatter beads in it.
  const band = make();
  const bc = band.getContext("2d")!;
  const rr = Math.max(1.5, r * 0.5);
  for (let k = 0; k < 12; k++) bc.drawImage(lettersOnly, Math.cos((k / 12) * Math.PI * 2) * rr, Math.sin((k / 12) * Math.PI * 2) * rr);
  bc.globalCompositeOperation = "destination-out";
  bc.drawImage(clear, 0, 0);
  // Keep beads off the drips and their joints (real runs carry their water with them; beads there break the joint).
  for (let k = 0; k < 12; k++) bc.drawImage(runs, Math.cos((k / 12) * Math.PI * 2) * r * 1.5, Math.sin((k / 12) * Math.PI * 2) * r * 1.5);
  const ridges = make();
  const rc = ridges.getContext("2d")!;
  const px = bc.getImageData(0, 0, o.size, o.size).data;
  const edge: number[] = [];
  for (let i = 3; i < px.length; i += 4 * 3) if (px[i] > 140) edge.push((i - 3) / 4); // every 3rd pixel is plenty
  const scatter = seeded(777);
  const count = Math.min(1250, Math.round(edge.length / (rr * 4.4)));
  for (let n = 0; n < count; n++) {
    const at = edge[Math.floor(scatter() * edge.length)];
    beads.push({ x: (at % o.size) + (scatter() - 0.5), y: Math.floor(at / o.size) + (scatter() - 0.5), r: rr * (0.25 + scatter() ** 2 * 0.75) });
  }
  // Drip threads read as dark lines (light bends at the water film), darkest along their edges.
  if (threads.length) {
    const shade = make(); // drawn opaque, then applied once (overlapping translucent stamps would stack to black)
    const sh = shade.getContext("2d")!;
    sh.fillStyle = "#000";
    for (const path of threads) {
      for (const pt of path) {
        sh.beginPath();
        sh.arc(pt.x, pt.y, pt.w + 0.6 * Math.min(1, pt.w), 0, Math.PI * 2);
        sh.fill();
      }
    }
    rc.globalAlpha = 0.3;
    rc.drawImage(shade, 0, 0);
    // A faint glossy highlight along the left of each thread, where the water film catches the light.
    const gloss = make();
    const gl = gloss.getContext("2d")!;
    gl.fillStyle = "#fff";
    for (const path of threads) {
      for (const pt of path) {
        gl.beginPath();
        gl.arc(pt.x - pt.w * 0.4, pt.y, Math.max(0.35, pt.w * 0.3), 0, Math.PI * 2);
        gl.fill();
      }
    }
    rc.globalAlpha = 0.2;
    rc.drawImage(gloss, 0, 0);
    rc.globalAlpha = 1;
  }
  // Beads: dark rim, bright highlight top-left.
  for (const b of beads) {
    const rim = rc.createRadialGradient(b.x, b.y, b.r * 0.55, b.x, b.y, b.r * 1.08);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, `rgba(0,0,0,${b.r > 2 ? 0.45 : 0.28})`);
    rc.fillStyle = rim;
    rc.beginPath();
    rc.arc(b.x, b.y, b.r * 1.08, 0, Math.PI * 2);
    rc.fill();
    rc.fillStyle = `rgba(255,255,255,${b.r > 2 ? 0.6 : 0.35})`;
    rc.beginPath();
    rc.arc(b.x - b.r * 0.32, b.y - b.r * 0.38, Math.max(0.5, b.r * 0.22), 0, Math.PI * 2);
    rc.fill();
  }
  return { clear, ridges, box, samples, fontPx: titleSize * fit };
}

/** Page fill plus the cover as soft light bleeding past its edges, under the glass styles. */
function drawBleed(ctx: CanvasRenderingContext2D, art: LoadedArt, f: ReturnType<typeof coverFrame>, W: number, H: number, glow: number) {
  const img = art.img;
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.fillStyle = rgb(BG);
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = glow;
  ctx.filter = "blur(60px)";
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, f.ox - f.side * 0.2, f.oy - f.side * 0.2, f.side * 1.4, f.side * 1.4);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

/**
 * Fades an off-screen cover's edges into the page, longest towards the content column (multiplies its alpha). With
 * `pad` > 0 the canvas holds the cover plus a bleed margin of `pad` px on every side, which fades out to nothing.
 */
type Fade = { h: [number, number][] | null; v: [number, number][] | null };

/**
 * Where a layer of `size` px fades out at its edges: alpha stops across (h) and down (v), at fractions of `size`. A
 * full-screen (`fill`) layer doesn't fade.
 */
function fadeStops(wide: boolean, size: number, pad = 0, fill = false): Fade {
  if (fill) return { h: null, v: null };
  const side = size - 2 * pad;
  const at = (px: number) => px / size; // canvas px → gradient offset
  const out: [number, number][] = pad ? [[0, 0], [at(pad), 1], [at(pad + side), 1], [1, 0]] : [];
  if (wide) return { h: pad ? [[0, 0], [at(pad + side * 0.3), 1], [at(pad + side), 1], [1, 0]] : [[0, 0], [0.3, 1]], v: pad ? out : [[0, 0], [0.1, 1], [0.9, 1], [1, 0]] };
  return { h: pad ? out : null, v: [[0, pad ? 0 : 1], ...(pad ? ([[at(pad), 1]] as [number, number][]) : []), [at(pad + side * 0.5), 1], [1, 0]] };
}

/** The edge fade feather() applies at (x, y) px of a layer of `size` px, 0–1. */
function fadeAt(f: Fade, size: number, x: number, y: number) {
  const along = (stops: [number, number][] | null, t: number) => {
    if (!stops) return 1;
    const k = Math.min(1, Math.max(0, t));
    for (let i = 1; i < stops.length; i++) {
      const [t0, a0] = stops[i - 1];
      const [t1, a1] = stops[i];
      if (k <= t1) return t1 > t0 ? a0 + ((a1 - a0) * (k - t0)) / (t1 - t0) : a1;
    }
    return stops[stops.length - 1][1];
  };
  return along(f.h, x / size) * along(f.v, y / size);
}

function feather(o: CanvasRenderingContext2D, wide: boolean, size: number, pad = 0, fill = false) {
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "destination-in";
  const pass = (horizontal: boolean, stops: [number, number][]) => {
    const g = horizontal ? o.createLinearGradient(0, 0, size, 0) : o.createLinearGradient(0, 0, 0, size);
    for (const [at, a] of stops) g.addColorStop(Math.min(1, Math.max(0, at)), `rgba(0,0,0,${a})`);
    o.fillStyle = g;
    o.fillRect(0, 0, size, size);
  };
  const f = fadeStops(wide, size, pad, fill);
  if (f.h) pass(true, f.h);
  if (f.v) pass(false, f.v);
  o.restore();
}

/**
 * The cover drawn into a square with a `pad`-px margin on every side (for edge bleed). The margin is the cover's
 * edges stretched outward and heavily blurred (the blur dissolves the stretch streaks), and the crisp cover fades
 * into it over its outer `soft` px, so focus falls off gradually instead of stopping at the cover's edge.
 */
function padCover(img: HTMLImageElement, coverPx: number, pad: number, soft: number) {
  const cover = document.createElement("canvas");
  cover.width = cover.height = coverPx;
  const cc = cover.getContext("2d")!;
  cc.putImageData(new ImageData(new Uint8ClampedArray(sampleSquare(img, coverPx)), coverPx, coverPx), 0, 0);
  const size = coverPx + 2 * pad;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const o = c.getContext("2d")!;
  if (!pad) {
    o.drawImage(cover, 0, 0);
    return o.getImageData(0, 0, size, size).data;
  }
  const ext = document.createElement("canvas");
  ext.width = ext.height = size;
  const x = ext.getContext("2d")!;
  const e = coverPx - 1;
  x.drawImage(cover, pad, pad);
  x.drawImage(cover, 0, 0, 1, coverPx, 0, pad, pad, coverPx); // left
  x.drawImage(cover, e, 0, 1, coverPx, pad + coverPx, pad, pad, coverPx); // right
  x.drawImage(cover, 0, 0, coverPx, 1, pad, 0, coverPx, pad); // top
  x.drawImage(cover, 0, e, coverPx, 1, pad, pad + coverPx, coverPx, pad); // bottom
  for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [e, 0, pad + coverPx, 0], [0, e, 0, pad + coverPx], [e, e, pad + coverPx, pad + coverPx]]) {
    x.drawImage(cover, sx, sy, 1, 1, dx, dy, pad, pad); // corners
  }
  o.filter = `blur(${Math.max(6, pad * 0.35)}px)`;
  o.drawImage(ext, 0, 0);
  o.filter = "none";
  // The crisp cover, its outer band faded so it melts into the blurred margin.
  const s = Math.min(coverPx / 2, soft) / coverPx;
  if (s > 0) {
    cc.globalCompositeOperation = "destination-in";
    for (const horizontal of [true, false]) {
      const g = horizontal ? cc.createLinearGradient(0, 0, coverPx, 0) : cc.createLinearGradient(0, 0, 0, coverPx);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(s, "rgba(0,0,0,1)");
      g.addColorStop(1 - s, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      cc.fillStyle = g;
      cc.fillRect(0, 0, coverPx, coverPx);
    }
  }
  o.drawImage(cover, pad, pad);
  return o.getImageData(0, 0, size, size).data;
}

// ── 8. Echo ─────────────────────────────────────────────────────────────────────────────────────────
/** A crisp cover with larger, softer, fainter copies behind it, like reverb tails, breathing slowly out of step. */
const ECHOES = [
  { k: 1.55, blur: 28, o: 0.16 },
  { k: 1.22, blur: 12, o: 0.28 },
  { k: 0.96, blur: 4, o: 0.45 },
];
export function Echo({ art, p }: V) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="cover-box grid place-items-center">
        {ECHOES.map((e, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- proxied artwork
          <img
            key={e.k}
            src={art.src}
            alt=""
            className="animate-breathe absolute rounded-[4px] object-cover"
            style={
              {
                width: `${p.size}%`,
                height: `${p.size}%`,
                "--k": 1 + (e.k - 1) * p.spread,
                filter: `blur(${e.blur * p.blur}px) brightness(${p.brightness + 0.1})`,
                opacity: Math.min(1, e.o * p.fade),
                animationDuration: `${p.breathe}s`,
                animationDelay: `${(-i * p.breathe) / 3}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied artwork */}
        <img
          src={art.src}
          alt=""
          className="relative rounded-[4px] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
          style={{ width: `${p.size}%`, height: `${p.size}%`, filter: `brightness(${p.brightness})` }}
        />
      </div>
    </div>
  );
}

/** The cover as soft light filling the whole page, so the cover's edges never meet flat black. */
function Ambient({ src, opacity = 0.35 }: { src: string; opacity?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied artwork
    <img src={src} alt="" style={{ opacity }} className="absolute inset-0 h-full w-full scale-125 object-cover blur-[70px] saturate-150" />
  );
}

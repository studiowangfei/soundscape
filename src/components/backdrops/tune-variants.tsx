"use client";

// The background styles offered only in Tune while developing (Backdrop.tsx loads this file only then); the deployed
// site shows Fog (variants.tsx) and never downloads these.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { accentOf, BG, coverFrame, fitCanvas, luminance, palette, rgb, sampleSquare, useResizeDraw, type RGB } from "./art";
import { narrow, zoomStyle } from "./params";
import { drawBleed, feather, type V } from "./variants";

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

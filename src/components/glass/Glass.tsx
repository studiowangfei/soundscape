"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TuneSection } from "../backdrops/Backdrop";
import type { Params } from "../backdrops/params";
import { displacementMap, lensProfile } from "./map";
import { fillColor, GLASS_PARAMS, GLASS_STORE, glassDefaults, glassLook, glassToSave, readGlass, shadeCurve, type GlassKind, type GlassLook } from "./settings";

/**
 * Liquid Glass panes. A pane is any element with the `glass` class and the style from useGlass(): its backdrop runs
 * through an SVG filter (Chromium; see glassBoot) that bends the view towards the rounded edge like a lens (the map
 * from map.ts), building gradually from the middle, then frosts it all evenly, lets it glow a little towards the rim
 * and lifts the colours. Other browsers get frost alone. Panes put the filter inside themselves and a GlassEdge (the light on the rim) last. No blend modes anywhere:
 * in Chrome they pull layers in front of the open card.
 */

const Settings = createContext<Params>(glassDefaults());
export const GlassProvider = Settings.Provider;
export const useGlassSettings = () => useContext(Settings);

/** Tune → Glass: the settings (remembered in this browser) and the Tune panel group that changes them. */
export function useGlassTune(): { settings: Params; section: TuneSection } {
  const [settings, setSettings] = useState<Params>(glassDefaults);
  useEffect(() => {
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(GLASS_STORE) ?? "null");
    } catch {
      // Unreadable or blocked: the defaults.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setSettings(readGlass(saved));
  }, []);
  const save = (next: Params) => {
    setSettings(next);
    try {
      localStorage.setItem(GLASS_STORE, JSON.stringify(glassToSave(next)));
    } catch {
      // Not remembered; fine.
    }
  };
  return {
    settings,
    section: { title: "Glass", specs: GLASS_PARAMS, values: settings, onParam: (key, v) => save({ ...settings, [key]: v }), onReset: () => save(glassDefaults()) },
  };
}

// The refraction maps, drawn once per pane size (all the cards share one).
const PROFILE = lensProfile(256);
const maps = new Map<string, string>();
function mapUrl(width: number, height: number, radius: number, bezel: number) {
  const key = `${width}x${height}/${radius}/${bezel}`;
  let url = maps.get(key);
  if (!url) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.putImageData(new ImageData(displacementMap({ width, height, radius, bezel }, PROFILE), width, height), 0, 0);
    url = canvas.toDataURL();
    maps.set(key, url);
  }
  return url;
}

/** The refraction eases in when a pane's map is first ready, rather than snapping on. */
const EASE_IN_MS = 450;

export type Glass = {
  /** The pane's ref callback: measures it (the filter is drawn to its exact size). */
  attach: (el: HTMLElement | null) => void;
  /** The pane's style: corner radius, fill and filter (as CSS variables the `glass` class reads). */
  style: CSSProperties;
  /** The pane's SVG filter; render it inside the pane. */
  filter: ReactNode;
  look: GlassLook;
  /** Sets frost, refraction (px) and fill directly, frame by frame (the open card's morph). */
  live: (v: { frost: number; refraction: number; fill: number }) => void;
};

/**
 * A pane of the given kind (card, open card or player), sized to its element. `sync`: draw the refraction before the
 * first paint (the open card appears mid-animation, so it must have it from the first frame).
 */
export function useGlass(kind: GlassKind, { sync = false }: { sync?: boolean } = {}): Glass {
  const look = glassLook(kind, useContext(Settings));
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const el = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const svgFilter = useRef<SVGFilterElement>(null);
  const frost = useRef<SVGFEGaussianBlurElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const attach = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    el.current = node;
    if (!node) return;
    const measure = () => {
      const w = Math.round(node.offsetWidth);
      const h = Math.round(node.offsetHeight);
      if (w > 0 && h > 0) setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node);
  }, []);

  // The open card measures itself before its first paint; the rest settle on the observer's first report.
  useLayoutEffect(() => {
    if (!sync || !el.current) return;
    const w = Math.round(el.current.offsetWidth);
    const h = Math.round(el.current.offsetHeight);
    if (w > 0 && h > 0) setSize({ w, h }); // before the first paint, so the first frame has the map
  }, [sync]);

  const map = size ? mapUrl(size.w, size.h, look.radius, look.bezel) : null;

  // Every displacement pass (three with dispersion: red, green and blue bend by slightly different amounts) takes the
  // bend times its own share, data-k.
  const bend = useCallback((px: number) => {
    for (const node of svgFilter.current?.querySelectorAll<SVGFEDisplacementMapElement>("feDisplacementMap") ?? []) {
      node.setAttribute("scale", (px * 2 * Number(node.dataset.k ?? 1)).toFixed(2));
    }
  }, []);

  // Ease the bend in the first time the map is there (a card's page load), unless this pane is driven live.
  const eased = useRef(false);
  useLayoutEffect(() => {
    if (!map || !svgFilter.current || eased.current || sync) return;
    eased.current = true;
    const target = look.refraction;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / EASE_IN_MS);
      bend(target * t * (2 - t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    bend(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, look.refraction, sync, bend]);

  const live = useCallback(
    (v: { frost: number; refraction: number; fill: number }) => {
      frost.current?.setAttribute("stdDeviation", v.frost.toFixed(2));
      bend(v.refraction);
      el.current?.style.setProperty("--glass-fill", fillColor(v.fill));
    },
    [bend],
  );

  const style = {
    borderRadius: look.radius,
    "--glass-fill": fillColor(look.fill),
    "--glass-fill-hover": fillColor(look.fill + 0.035),
    "--glass-filter": `url(#${id})`,
    "--glass-fallback": `blur(${(8 + look.frost * 2).toFixed(1)}px) saturate(${look.vibrancy}) brightness(${(1 - 0.3 * look.shade).toFixed(2)})`,
  } as CSSProperties;

  // feDisplacementMap's scale is the full swing of the map's channels (0…255 → −½…+½ of it), so twice the bend.
  const scale = look.refraction * 2;
  const d = look.dispersion;
  const displacement = (k: number, result: string) => (
    <feDisplacementMap data-k={k} in="SourceGraphic" in2="map" scale={scale * k} xChannelSelector="R" yChannelSelector="G" result={result} />
  );
  const lift = 1 + look.glow;
  const shade = shadeCurve(look.shade, 9)
    .map((v) => v.toFixed(4))
    .join(" ");
  // Bent first, then frosted all over: one even frost from rim to middle, so nothing marks where the bend begins.
  const filter = (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute">
      <filter ref={svgFilter} id={id} colorInterpolationFilters="sRGB" {...(size ? { x: 0, y: 0, width: size.w, height: size.h, filterUnits: "userSpaceOnUse" } : {})}>
        {map && size ? (
          <>
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            {d > 0 ? (
              <>
                {/* Dispersion: red bends a little more than green, blue a little less; recombined channel by channel. */}
                {displacement(1 + d, "bentR")}
                {displacement(1, "bentG")}
                {displacement(1 - d, "bentB")}
                <feColorMatrix in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
                <feColorMatrix in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
                <feColorMatrix in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
                <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg" />
                <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" result="bent" />
              </>
            ) : (
              displacement(1, "bent")
            )}
            <feGaussianBlur ref={frost} in="bent" stdDeviation={look.frost} edgeMode="duplicate" result="frosted" />
            {/* A glow that builds towards the rim, by the map's smooth bezel weight: light gathered in the thick of it. */}
            <feColorMatrix in="map" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="edge" />
            <feComponentTransfer in="frosted" result="lit">
              <feFuncR type="linear" slope={lift} />
              <feFuncG type="linear" slope={lift} />
              <feFuncB type="linear" slope={lift} />
            </feComponentTransfer>
            <feComposite in="lit" in2="edge" operator="in" result="litEdge" />
            <feMerge result="glass">
              <feMergeNode in="frosted" />
              <feMergeNode in="litEdge" />
            </feMerge>
          </>
        ) : (
          <feGaussianBlur ref={frost} in="SourceGraphic" stdDeviation={look.frost} edgeMode="duplicate" result="glass" />
        )}
        <feColorMatrix in="glass" type="saturate" values={String(look.vibrancy)} result="vivid" />
        <feComponentTransfer in="vivid">
          <feFuncR type="table" tableValues={shade} />
          <feFuncG type="table" tableValues={shade} />
          <feFuncB type="table" tableValues={shade} />
        </feComponentTransfer>
      </filter>
    </svg>
  );

  return { attach, style, filter, look, live };
}

/** The light caught along the rim: brightest top left, a fainter catch bottom right. Render it last in the pane. */
export function GlassEdge({ light }: { light: number }) {
  return <span aria-hidden className="glass-edge" style={{ "--edge": light } as CSSProperties} />;
}

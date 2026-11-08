/**
 * The song page's Liquid Glass (the cards, the player and the open card), tuned in Tune → Glass and remembered in this
 * browser. The cards can instead take Canvas UI's glass (canvasui.dev's hero cards): plain CSS, a backdrop blur under a
 * black tint with a hairline white border; no lens, no rim light, no shadow. Theirs sits over a bright photo, ours over
 * a dimmed cover, so it can also lift (brighten) and saturate what it blurs, and its tint can go light. Pure, so it's
 * tested in Node; the React side is in Glass.tsx.
 */
import { defaults, type Param, type Params } from "../backdrops/params";
import { LENS_POWER } from "./map";

export const GLASS_STORE = "soundscape.glass";

/**
 * An inline script for <head>: marks Chromium (<html class="svg-glass">) before the first paint. Only Chromium runs SVG
 * filters on the backdrop, which the refraction needs; elsewhere the glass is frost alone. Touch screens (Android
 * phones) get frost too: refracting every card's backdrop as the row scrolls is heavy for a phone, and this way
 * phones look alike whatever their browser.
 */
export const glassBoot = () =>
  `try{var b=navigator.userAgentData&&navigator.userAgentData.brands;if(b&&!matchMedia("(pointer: coarse)").matches&&b.some(function(x){return /Chrom|Edge|Opera|Brave/.test(x.brand)}))document.documentElement.classList.add("svg-glass")}catch(e){}`;

export const GLASS_PARAMS: Param[] = [
  // Canvas UI's glass on the cards (the tiles and the open card; the player keeps Liquid Glass). Its own values are
  // Tailwind's backdrop-blur-md (12px), bg-black/25 and border-white/10, nothing lifted or saturated (lift 1, saturation
  // 1, tint -0.25): over our dimmed cover that's near black, so it starts lifted, more saturated and lightly white.
  { key: "canvas", label: "Canvas UI glass on cards", min: 0, max: 1, step: 1, value: 0 },
  { key: "canvasBlur", label: "Blur", min: 0, max: 40, step: 0.5, value: 12, unit: "px", when: "canvas" },
  // Brightens what the glass blurs: their cards sit over a bright photo, ours over a dimmed cover.
  { key: "canvasLift", label: "Lift (brighten behind)", min: 1, max: 4, step: 0.05, value: 2, unit: "×", when: "canvas" },
  { key: "canvasSaturate", label: "Saturation", min: 0.5, max: 2.5, step: 0.05, value: 1, unit: "×", when: "canvas" },
  // Black below zero, white above (as Fill below).
  { key: "canvasFill", label: "Tint (dark – light)", min: -0.8, max: 0.5, step: 0.01, value: 0.1, when: "canvas" },
  { key: "canvasBorder", label: "Border (white)", min: 0, max: 0.5, step: 0.01, value: 0.1, when: "canvas" },
  // 1 bends the rim as far as it goes before the view folds over (see map.ts); above that, a mirrored sliver.
  { key: "refraction", label: "Refraction", min: 0, max: 1.6, step: 0.05, value: 1.6 },
  // How far in from the rim the bend reaches; it builds gradually over all of it (map.ts), so wide is smooth.
  { key: "edge", label: "Edge width", min: 6, max: 120, step: 1, value: 30, unit: "px" },
  { key: "frost", label: "Frost", min: 0, max: 30, step: 0.5, value: 4, unit: "px" },
  { key: "glow", label: "Edge glow", min: 0, max: 1, step: 0.05, value: 0.3 },
  { key: "light", label: "Edge light", min: 0, max: 1, step: 0.05, value: 0.5 },
  { key: "dispersion", label: "Dispersion", min: 0, max: 0.3, step: 0.01, value: 0 },
  { key: "fill", label: "Fill (dark – light)", min: -0.6, max: 0.3, step: 0.01, value: 0.05 },
  { key: "vibrancy", label: "Vibrancy", min: 0.5, max: 2.5, step: 0.05, value: 1.5 },
  { key: "shade", label: "Shade bright backdrops", min: 0, max: 1, step: 0.05, value: 0 },
  { key: "dim", label: "Dim behind an open card", min: 0, max: 0.9, step: 0.05, value: 0.6 },
  { key: "blurBehind", label: "Blur behind an open card", min: 0, max: 24, step: 0.5, value: 8, unit: "px" },
  // More frost and a fuller fill on the open card: less of the page shows through it.
  { key: "openOpacity", label: "Open card opacity", min: 0, max: 1, step: 0.05, value: 0.8 },
];

export const glassDefaults = (): Params => defaults(GLASS_PARAMS);

/** What's saved, made safe: known settings that are numbers, clamped to their sliders; defaults for the rest. */
export function readGlass(saved: unknown): Params {
  const out = glassDefaults();
  if (typeof saved !== "object" || saved === null) return out;
  for (const p of GLASS_PARAMS) {
    const v = (saved as Record<string, unknown>)[p.key];
    if (typeof v === "number" && Number.isFinite(v)) out[p.key] = Math.min(p.max, Math.max(p.min, v));
  }
  return out;
}

/** What's saved: only what differs from the defaults, so later changes to the defaults still reach you. */
export function glassToSave(s: Params): Params {
  const base = glassDefaults();
  return Object.fromEntries(Object.entries(s).filter(([k, v]) => k in base && v !== base[k]));
}

export type GlassKind = "card" | "expanded" | "player";

/**
 * One pane's glass: corner radius, bezel width and the most the bezel bends the view (px), frost (px), edge glow,
 * rim light, dispersion (how far apart red and blue bend), fill, vibrancy and shade (see shadeCurve). `canvas`: Canvas
 * UI's glass instead, its frost a plain CSS blur, brightened by `lift`, and a border (`ring`, its white's opacity) in
 * place of the rim light.
 */
export type GlassLook = {
  radius: number;
  bezel: number;
  refraction: number;
  frost: number;
  glow: number;
  light: number;
  dispersion: number;
  fill: number;
  vibrancy: number;
  shade: number;
  canvas: boolean;
  lift: number;
  ring: number;
};

/** How far the preview player's cover sits from the bar's edges (left, top and bottom alike). */
export const PLAYER_INSET = 10;
/** The preview player's height: its 48px cover with the inset above and below. */
export const PLAYER_HEIGHT = 48 + 2 * PLAYER_INSET;

// The open card is big and floats over an already blurred page: a wider edge and a lighter fill (as in the design);
// its frost and fill grow with Open card opacity (below). The player is slim: a narrower edge, at most half its height.
const KINDS: Record<GlassKind, { radius: number; bezel: number; frost: number; fill: number }> = {
  card: { radius: 24, bezel: 1, frost: 1, fill: 0 },
  expanded: { radius: 24, bezel: 1.5, frost: 0.3, fill: 0.03 },
  player: { radius: 16, bezel: 0.6, frost: 1, fill: 0 },
};

export function glassLook(kind: GlassKind, s: Params): GlassLook {
  const k = KINDS[kind];
  // The open card is the same as its tile here, so it grows out of it with nothing changing on the way.
  if (s.canvas && kind !== "player")
    return { radius: k.radius, bezel: 0, refraction: 0, frost: s.canvasBlur, glow: 0, light: 0, dispersion: 0, fill: s.canvasFill, vibrancy: s.canvasSaturate, shade: 0, canvas: true, lift: s.canvasLift, ring: s.canvasBorder };
  const bezel = Math.min(kind === "player" ? PLAYER_HEIGHT / 2 : Infinity, Math.round(s.edge * k.bezel));
  return {
    radius: k.radius,
    bezel,
    refraction: (s.refraction * bezel) / LENS_POWER,
    frost: s.frost * k.frost + (kind === "expanded" ? 14 * s.openOpacity : 0),
    glow: s.glow,
    light: s.light,
    dispersion: s.dispersion,
    fill: s.fill + k.fill + (kind === "expanded" ? 0.1 * s.openOpacity : 0),
    vibrancy: s.vibrancy,
    shade: s.shade,
    canvas: false,
    lift: 1,
    ring: 0,
  };
}

/**
 * The tone curve the glass puts on what's behind it, sampled at `samples` points over 0…1: x / (1 + a·x), which
 * leaves darks as they are and caps white at 1 − shade/2. Apple's glass does the same, so white text on it stays
 * readable over a bright cover.
 */
export function shadeCurve(shade: number, samples: number): number[] {
  const a = 1 / (1 - shade / 2) - 1;
  return Array.from({ length: samples }, (_, i) => {
    const x = i / (samples - 1);
    return x / (1 + a * x);
  });
}

/** The glass's fill: white above zero, black below. */
export const fillColor = (fill: number) => (fill >= 0 ? `rgba(255,255,255,${fill.toFixed(3)})` : `rgba(0,0,0,${(-fill).toFixed(3)})`);

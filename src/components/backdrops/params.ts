/** Tunable settings per backdrop style, shown as sliders in the switcher's Tune panel. */
/**
 * A slider; a dropdown when `options` is given (the value is then the option's index); a switch when it runs 0–1 in
 * steps of 1. `when` names another setting: this one is only shown while that one is on (non-zero).
 */
export type Param = { key: string; label: string; min: number; max: number; step: number; value: number; unit?: string; options?: string[]; when?: string; color?: boolean };
export type Params = Record<string, number>;

/** Sizes are for wide screens; narrow screens use 3/4 of them. */
export const narrow = (px: number, wide: boolean) => (wide ? px : Math.max(2, Math.round(px * 0.75)));

const zoom = (amount: number, secs: number): Param[] => [
  { key: "zoom", label: "Zoom amount", min: 0, max: 40, step: 1, value: amount, unit: "%" },
  { key: "zoomSecs", label: "Zoom duration", min: 5, max: 90, step: 1, value: secs, unit: "s" },
];
const brightness = (value: number): Param => ({ key: "brightness", label: "Brightness", min: 0.2, max: 1, step: 0.02, value });
const glow = (value: number): Param => ({ key: "glow", label: "Ambient glow", min: 0, max: 0.8, step: 0.05, value });
const bleed = (value: number): Param => ({ key: "bleed", label: "Edge bleed", min: 0, max: 30, step: 1, value, unit: "cells" });
/** Marks settings that only matter while another one is on, e.g. the Fog style's text settings. */
const shownWhen = (key: string) => (s: Param): Param => ({ ...s, when: key });

/** Typefaces for the Fog style's finger-written title. Families fall back across macOS/Windows/web; `var(--…)` names
 * are the app's own next/font families, resolved at draw time. */
export const FOG_FONTS = [
  { label: "Handwriting", family: '"Bradley Hand", "Segoe Print", "Noteworthy", cursive', weight: 700 },
  { label: "Marker", family: '"Marker Felt", "Permanent Marker", "Segoe Print", fantasy', weight: 400 },
  { label: "Script", family: '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive', weight: 700 },
  { label: "Comic Sans", family: '"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive', weight: 700 },
  { label: "Serif", family: "var(--font-serif)", weight: 500 }, // the app's serif, as chosen in Tune → Text
  { label: "Sans serif", family: 'var(--font-geist-sans), "Helvetica Neue", Arial, sans-serif', weight: 500 },
  { label: "Typewriter", family: '"American Typewriter", "Courier New", monospace', weight: 400 },
  { label: "Chalkboard", family: '"Chalkboard SE", "Chalkboard", "Comic Sans MS", cursive', weight: 400 },
];

export const PARAMS = {
  mosaic: [
    { key: "tile", label: "Tile size", min: 4, max: 48, step: 1, value: 12, unit: "px" },
    brightness(0.6),
    { key: "grout", label: "Grout", min: 0, max: 0.8, step: 0.02, value: 0.28 },
    bleed(10),
  ],
  halftone: [
    { key: "pitch", label: "Dot spacing", min: 4, max: 32, step: 1, value: 9, unit: "px" },
    { key: "dot", label: "Dot size", min: 0.4, max: 1.6, step: 0.05, value: 1.05 },
    { key: "angle", label: "Screen angle", min: 0, max: 90, step: 1, value: 15, unit: "°" },
    { key: "ink", label: "Ink", min: 0.2, max: 1, step: 0.02, value: 0.78 },
    { key: "paper", label: "Paper tint", min: 0, max: 0.3, step: 0.01, value: 0.06 },
    bleed(8),
  ],
  blur: [
    { key: "blur", label: "Blur", min: 0, max: 40, step: 1, value: 8, unit: "px" },
    brightness(0.62),
    { key: "saturation", label: "Saturation", min: 0.5, max: 2, step: 0.05, value: 1.15 },
    glow(0.35),
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, value: 0.07 },
    ...zoom(10, 20),
  ],
  zoom: [brightness(0.6), glow(0.25), ...zoom(18, 36)],
  glass: [
    { key: "flute", label: "Flute width", min: 8, max: 80, step: 1, value: 30, unit: "px" },
    { key: "squeeze", label: "Squeeze", min: 1, max: 3, step: 0.05, value: 1.7, unit: "×" },
    { key: "ridges", label: "Ridge shading", min: 0, max: 2, step: 0.05, value: 1 },
    brightness(0.62),
    { key: "glow", label: "Ambient glow", min: 0, max: 0.8, step: 0.05, value: 0.3 },
    ...zoom(10, 20),
  ],
  pixelglass: [
    { key: "pixel", label: "Pixel size", min: 6, max: 96, step: 1, value: 32, unit: "px" },
    { key: "detail", label: "Detail per pixel", min: 1, max: 4, step: 1, value: 2 },
    { key: "spread", label: "Lens spread", min: 0, max: 2, step: 0.1, value: 1 },
    { key: "flip", label: "Flip (lens inversion)", min: 0, max: 1, step: 1, value: 1 },
    { key: "edges", label: "Edge lines", min: 0, max: 0.4, step: 0.01, value: 0.08 },
    brightness(0.62),
    bleed(10),
    { key: "reveal", label: "Reveal on hover", min: 0, max: 1, step: 1, value: 1 },
    { key: "revealMs", label: "Reveal duration", min: 0, max: 3000, step: 50, value: 350, unit: "ms" },
    ...zoom(10, 20),
  ],
  fog: [
    { key: "density", label: "Mist thickness", min: 0, max: 1, step: 0.02, value: 0.08 },
    { key: "opacity", label: "Mist opacity", min: 0, max: 1, step: 0.02, value: 0 },
    { key: "blur", label: "Mist blur", min: 2, max: 120, step: 1, value: 10, unit: "px" },
    { key: "bloom", label: "Light bloom", min: 0, max: 1, step: 0.05, value: 0.5 },
    { key: "patchiness", label: "Patchiness", min: 0, max: 1, step: 0.05, value: 0 },
    { key: "drops", label: "Droplets", min: 0, max: 2.5, step: 0.05, value: 0.35, unit: "×" },
    { key: "dropSize", label: "Droplet size", min: 0.4, max: 2.5, step: 0.05, value: 0.7, unit: "×" },
    { key: "refraction", label: "Droplet refraction", min: 1, max: 6, step: 0.1, value: 3, unit: "×" },
    { key: "trails", label: "Drip trails", min: 0, max: 30, step: 1, value: 0 },
    { key: "brush", label: "Wipe size", min: 10, max: 240, step: 2, value: 90, unit: "px" },
    { key: "softness", label: "Wipe softness", min: 0, max: 1, step: 0.05, value: 0.5 },
    { key: "refog", label: "Fog returns (0 = never)", min: 0, max: 120, step: 1, value: 30, unit: "s" },
    // While a song is shown the pane keeps fogging up, from the settings above to the thickest fog, over `thicken`.
    { key: "thicken", label: "Fog thickens over (0 = never)", min: 0, max: 600, step: 10, value: 60, unit: "s" },
    shownWhen("thicken")({ key: "thickMax", label: "Thickest fog", min: 0.1, max: 1, step: 0.05, value: 0.7 }),
    // Now and then one of the larger droplets runs down, clearing a trail; never more than one per `dripEvery`.
    { key: "autoDrips", label: "Drops run down on their own", min: 0, max: 1, step: 1, value: 1 },
    ...[
      { key: "dripEvery", label: "Time between runs (at least)", min: 3, max: 60, step: 1, value: 15, unit: "s" },
      { key: "dripFade", label: "Run trails fog over (0 = never)", min: 0, max: 300, step: 10, value: 40, unit: "s" },
    ].map(shownWhen("autoDrips")),
    // Off removes the title and artist written in the fog, the drips from their letters, and the haze behind them.
    { key: "text", label: "Finger-written text & drips", min: 0, max: 1, step: 1, value: 0 },
    ...[
      { key: "font", label: "Typeface", min: 0, max: FOG_FONTS.length - 1, step: 1, value: 0, options: FOG_FONTS.map((f) => f.label) },
      { key: "textSize", label: "Text size", min: 0.4, max: 1.8, step: 0.05, value: 1, unit: "×" },
      { key: "finger", label: "Finger width", min: 0.3, max: 3, step: 0.05, value: 1, unit: "×" },
      { key: "spacing", label: "Letter spacing", min: 0, max: 0.6, step: 0.01, value: 0.12, unit: "em" },
      { key: "textAngle", label: "Text angle", min: -20, max: 20, step: 1, value: -4, unit: "°" },
      { key: "textX", label: "Text position (across)", min: 0.3, max: 0.8, step: 0.01, value: 0.6 },
      { key: "textY", label: "Text position (down)", min: 0.15, max: 0.85, step: 0.01, value: 0.42 },
      { key: "textDrips", label: "Drips from letters", min: 0, max: 20, step: 1, value: 6 },
      { key: "dripWidth", label: "Drip width", min: 1, max: 10, step: 0.1, value: 1, unit: "×" },
      { key: "clarity", label: "Stroke clarity", min: 0.3, max: 1, step: 0.02, value: 0.9 },
      { key: "visibility", label: "Text visibility", min: 0, max: 1, step: 0.05, value: 0.6 },
      { key: "textRefog", label: "Text fogs over (0 = never)", min: 0, max: 120, step: 1, value: 30, unit: "s" },
    ].map(shownWhen("text")),
    { key: "bleed", label: "Edge bleed", min: 0, max: 300, step: 5, value: 300, unit: "px" },
    { key: "edgeSoft", label: "Edge softness", min: 0, max: 200, step: 5, value: 20, unit: "px" },
    brightness(0.62),
    { key: "glow", label: "Ambient glow", min: 0, max: 0.8, step: 0.05, value: 0.3 },
    ...zoom(20, 20),
  ],
  echo: [
    { key: "size", label: "Cover size", min: 30, max: 95, step: 1, value: 70, unit: "%" },
    { key: "spread", label: "Echo spread", min: 0.5, max: 2, step: 0.05, value: 1, unit: "×" },
    { key: "blur", label: "Echo blur", min: 0, max: 3, step: 0.1, value: 1, unit: "×" },
    { key: "fade", label: "Echo strength", min: 0, max: 2, step: 0.1, value: 1, unit: "×" },
    brightness(0.6),
    { key: "breathe", label: "Breathing", min: 3, max: 30, step: 1, value: 9, unit: "s" },
  ],
} satisfies Record<string, Param[]>;

export const defaults = (specs: Param[]): Params => Object.fromEntries(specs.map((s) => [s.key, s.value]));

/** Inline style for the shared push-in animations (.animate-subtle-zoom / .animate-slow-zoom). The negative delay
 * starts it already in motion: ease-in-out from rest looks frozen for the first seconds after every song change. */
export const zoomStyle = (p: Params) =>
  ({ "--zoom-to": 1 + p.zoom / 100, animationDuration: `${p.zoomSecs}s`, animationDelay: `${-p.zoomSecs * 0.2}s` }) as React.CSSProperties;

/** The landing page's song wheel (landing/settings.ts wheelSettings turns these into WheelSettings). */
export const WHEEL_PARAMS: Param[] = [
  { key: "drum", label: "Drum diameter", min: 50, max: 250, step: 5, value: 100, unit: "% height" },
  { key: "spacing", label: "Row spacing", min: 1, max: 3, step: 0.05, value: 1.6, unit: "× text" }, // the focus gap keeps the search bar (2.15 × text tall) clear
  { key: "focusGap", label: "Room around the focused song", min: 0, max: 40, step: 1, value: 24, unit: "px" },
  { key: "falloff", label: "Size falloff", min: 0, max: 0.2, step: 0.01, value: 0.08 },
  { key: "dim", label: "Other songs' opacity", min: 0.1, max: 1, step: 0.05, value: 0.2 },
  { key: "longest", label: "Longest title width", min: 40, max: 95, step: 1, value: 80, unit: "% width" },
];

/** A colour setting: the value is 0xRRGGBB, picked with a colour well. */
const colour = (key: string, label: string, value: number): Param => ({ key, label, min: 0, max: 0xffffff, step: 1, value, color: true });

/**
 * The landing page's search bar round the centred song (landing/settings.ts searchBarLook turns these into its look).
 * Defaults as tuned on 2026-10-29, starting from the Figma design (52 px text: 4 px stroke at 25% white; 44 px from the
 * stroke to each icon, 20 px from the stroke to the text above and below, 48 px from the text to each icon).
 */
export const SEARCH_BAR_PARAMS: Param[] = [
  { key: "stroke", label: "Stroke weight", min: 0, max: 8, step: 0.5, value: 1.5, unit: "px" },
  colour("strokeColor", "Stroke colour", 0xffffff),
  { key: "strokeOpacity", label: "Stroke opacity", min: 0, max: 100, step: 5, value: 20, unit: "%" },
  { key: "padX", label: "Padding, sides", min: 0, max: 2, step: 0.02, value: 1, unit: "× text" },
  { key: "padY", label: "Padding, top and bottom", min: 0, max: 1, step: 0.02, value: 0.3, unit: "× text" },
  { key: "gap", label: "Space between text and icons", min: 0, max: 2, step: 0.02, value: 0.86, unit: "× text" },
  { key: "iconHeight", label: "Icon size", min: 0.5, max: 2, step: 0.05, value: 1, unit: "× title height" }, // 1: as tall as the title's capitals
  colour("iconColor", "Icon colour", 0xffffff),
  { key: "searchOpacity", label: "Search icon opacity", min: 0, max: 100, step: 5, value: 30, unit: "%" },
  { key: "arrowOpacity", label: "Arrow icon opacity", min: 0, max: 100, step: 5, value: 30, unit: "%" },
];

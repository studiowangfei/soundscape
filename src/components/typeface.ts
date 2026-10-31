/**
 * The app's serif typeface (song titles, card headlines, quotes, the landing wheel), chosen in the Tune panel and
 * remembered in this browser. Each choice is a next/font family loaded in app/layout.tsx under its own CSS variable;
 * choosing one points --font-serif (Tailwind's `font-serif`) at it. Pure, so it's tested in Node and usable from the
 * server layout; the React hook is in useTypeface.ts.
 */
import type { Param } from "./backdrops/params";

/** The first is the default. `variable` must match the font's `variable` in app/layout.tsx. */
export const TYPEFACES = [
  { key: "libre-baskerville", label: "Libre Baskerville", variable: "--font-libre-baskerville" },
  { key: "newsreader", label: "Newsreader", variable: "--font-newsreader" },
  { key: "playfair-display", label: "Playfair Display", variable: "--font-playfair-display" },
  { key: "lora", label: "Lora", variable: "--font-lora" },
  { key: "eb-garamond", label: "EB Garamond", variable: "--font-eb-garamond" },
  { key: "cormorant-garamond", label: "Cormorant Garamond", variable: "--font-cormorant-garamond" },
  { key: "fraunces", label: "Fraunces", variable: "--font-fraunces" },
  { key: "source-serif", label: "Source Serif 4", variable: "--font-source-serif" },
  { key: "dm-serif-display", label: "DM Serif Display", variable: "--font-dm-serif-display" },
  { key: "instrument-serif", label: "Instrument Serif", variable: "--font-instrument-serif" },
] as const;

export const TYPEFACE_STORE = "soundscape.typeface";

const find = (key: string) => TYPEFACES.find((t) => t.key === key);

/** The font stack for --font-serif; an unknown key gets the default. */
export const typefaceStack = (key: string) => `var(${(find(key) ?? TYPEFACES[0]).variable}), Georgia, serif`;

/** The Tune dropdown works by position; what's saved is the key. */
export const typefaceIndex = (key: string) => Math.max(0, TYPEFACES.findIndex((t) => t.key === key));
export const typefaceAt = (i: number) => (TYPEFACES[Math.round(i)] ?? TYPEFACES[0]).key;

export const TYPEFACE_PARAM: Param = { key: "typeface", label: "Serif typeface", min: 0, max: TYPEFACES.length - 1, step: 1, value: 0, options: TYPEFACES.map((t) => t.label) };

/** An inline script for <head>: applies the saved typeface before the first paint, so the old one never flashes. */
export function typefaceBoot() {
  const stacks = Object.fromEntries(TYPEFACES.map((t) => [t.key, typefaceStack(t.key)]));
  return `try{var s=${JSON.stringify(stacks)}[localStorage.getItem(${JSON.stringify(TYPEFACE_STORE)})];if(s)document.documentElement.style.setProperty("--font-serif",s)}catch(e){}`;
}

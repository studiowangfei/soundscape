/**
 * The app's typefaces:
 * - the serif (song titles, card headlines, quotes, the landing wheel): Libre Baskerville. While developing, Tune → Text
 *   offers others, each a next/font family loaded in app/layout.tsx under its own CSS variable; choosing one points
 *   --font-serif (Tailwind's `font-serif`) at it and is remembered in this browser.
 * - the Chinese typeface, Noto Serif SC (思源宋体), which draws Chinese characters only, wherever they appear (serif or
 *   sans text): it's first in every font stack (--font-cjk, app/globals.css), and its files, made at build time and
 *   served from the site itself, hold only the content's own Chinese characters (content/cjk-font.ts), so it has no
 *   glyphs for anything else and Latin text keeps its serif or sans.
 * Pure, so it's tested in Node and usable from the server layout; the React hook is in useTypeface.ts.
 */
import type { Param } from "./backdrops/params";

/** The first is the default (and the only one deployed). `variable` must match the font's `variable` in app/layout.tsx or app/tune-fonts.ts. */
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

/** The font stack for --font-serif: the Chinese typeface first (it only draws Chinese), then the serif; an unknown key gets the default. */
export const typefaceStack = (key: string) => `var(--font-cjk), var(${(find(key) ?? TYPEFACES[0]).variable}), Georgia, serif`;

/** The Tune dropdown works by position; what's saved is the key. */
export const typefaceIndex = (key: string) => Math.max(0, TYPEFACES.findIndex((t) => t.key === key));
export const typefaceAt = (i: number) => (TYPEFACES[Math.round(i)] ?? TYPEFACES[0]).key;

export const TYPEFACE_PARAM: Param = { key: "typeface", label: "Serif typeface", min: 0, max: TYPEFACES.length - 1, step: 1, value: 0, options: TYPEFACES.map((t) => t.label) };

/**
 * The Chinese typeface: `family` is what --font-cjk names in app/globals.css (our own name for it, see
 * content/cjk-font.ts), `google` its spec in the Google Fonts CSS2 API: the weights Chinese text is set in, 400 (artists,
 * comment quotes), 500 (song titles, the landing wheel, card text; components/CjkMedium.tsx) and 700 (the lyric card's
 * line), as one variable font file. Upright only: nothing Chinese is italic.
 */
export const CJK_TYPEFACE = { label: "Noto Serif SC 思源宋体", family: '"Soundscape Noto Serif SC"', google: "Noto+Serif+SC:wght@400..700" } as const;

/**
 * The characters the Chinese typeface draws: CJK radicals, symbols and punctuation (、。《》「」), bopomofo, strokes,
 * the unified ideographs and their extensions, compatibility forms and fullwidth forms (，！？). Not Japanese kana or
 * Korean hangul.
 */
export const CJK_UNICODE_RANGE =
  "U+2E80-2FFF, U+3000-303F, U+3100-312F, U+3190-31EF, U+3200-33FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE10-FE1F, U+FE30-FE4F, U+FF00-FFEF, U+20000-3134F";

const CJK_CHAR = new RegExp(
  `[${CJK_UNICODE_RANGE.split(", ")
    .map((r) => r.replace(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/, (_, a: string, b?: string) => `\\u{${a}}${b ? `-\\u{${b}}` : ""}`))
    .join("")}]`,
  "gu",
);

const CJK_RUN = new RegExp(`(${CJK_CHAR.source}+)`, "u");

/** `text` cut into runs of Chinese characters and runs of everything else, in order (for setting the Chinese apart). */
export function cjkRuns(text: string): { text: string; cjk: boolean }[] {
  return text
    .split(CJK_RUN)
    .map((t, i) => ({ text: t, cjk: i % 2 === 1 }))
    .filter((r) => r.text);
}

/** The distinct Chinese characters in `text`, in code point order, without spaces. */
export function cjkCharacters(text: string): string {
  return [...new Set(text.match(CJK_CHAR) ?? [])].filter((c) => c.trim()).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join("");
}

/** An inline script for <head> (while developing): applies the saved serif before the first paint, so the old one never flashes. */
export function typefaceBoot() {
  const stacks = Object.fromEntries(TYPEFACES.map((t) => [t.key, typefaceStack(t.key)]));
  return `try{var s=${JSON.stringify(stacks)}[localStorage.getItem(${JSON.stringify(TYPEFACE_STORE)})];if(s)document.documentElement.style.setProperty("--font-serif",s)}catch(e){}`;
}

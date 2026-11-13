/**
 * The Chinese typeface's font files (components/typeface.ts), made at build time by scripts/sync-cjk-font.mts and served
 * from the site itself: Google Fonts subsets Noto Serif SC to the Chinese characters the content uses, the build
 * downloads the result into public/fonts/noto-serif-sc/, and the root layout inlines its @font-face rules. Visitors'
 * browsers never contact Google (blocked in mainland China, where a stylesheet from it would hold up every page).
 * Pure, so it's tested in Node.
 */
import { CJK_TYPEFACE, cjkCharacters } from "../components/typeface";

/** Where the files go, under public/ (and so the URL path they're served at). */
export const CJK_FONT_DIR = "fonts/noto-serif-sc";
/** The @font-face rules, in that folder. */
export const CJK_FONT_CSS = "fonts.css";

/** Chinese characters per Google Fonts request: Google refuses a URL much past ~16 KB (2,000 characters, tested 2026-11-12). */
export const CJK_CHUNK = 600;

/**
 * The Google Fonts stylesheets for the Chinese typeface subset to the Chinese characters in `text` (the content): Google
 * limits each file to exactly those characters, so it stays small and never draws Latin. One stylesheet per CJK_CHUNK
 * characters, since the content grows with every Chinese song; the browser merges them (each face covers its own
 * characters). Empty when the text has no Chinese.
 */
export function cjkFontSourceHrefs(text: string): string[] {
  const chars = [...cjkCharacters(text)];
  const hrefs: string[] = [];
  for (let i = 0; i < chars.length; i += CJK_CHUNK) {
    hrefs.push(`https://fonts.googleapis.com/css2?family=${CJK_TYPEFACE.google}&text=${encodeURIComponent(chars.slice(i, i + CJK_CHUNK).join(""))}&display=swap`);
  }
  return hrefs;
}

/** The font file URLs a Google Fonts stylesheet points at, in order, each once. */
export function fontUrls(css: string): string[] {
  return [...new Set([...css.matchAll(/url\((['"]?)(.*?)\1\)/g)].map((m) => m[2]))];
}

/**
 * A Google Fonts stylesheet made ours: its faces under the typeface's own family name (so a copy of Noto Serif SC
 * installed on the device never stands in for it, Latin included), each file at `/fonts/noto-serif-sc/<file>`.
 */
export function selfHostedCss(css: string, fileFor: (url: string) => string): string {
  return css
    .replace(/font-family:\s*[^;]+;/g, `font-family: ${CJK_TYPEFACE.family};`)
    .replace(/url\((['"]?)(.*?)\1\)/g, (_, _q: string, url: string) => `url(/${CJK_FONT_DIR}/${fileFor(url)})`);
}

/** Every code point the stylesheet's unicode-range descriptors cover. */
export function coveredCodePoints(css: string): Set<number> {
  const covered = new Set<number>();
  for (const [, list] of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const part of list.split(",")) {
      const m = part.trim().match(/^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i);
      if (!m) continue;
      const from = parseInt(m[1], 16);
      const to = m[2] ? parseInt(m[2], 16) : from;
      for (let c = from; c <= to; c++) covered.add(c);
    }
  }
  return covered;
}

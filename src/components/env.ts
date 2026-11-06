/**
 * The environment the site is opened in, decided in one place: which layout the song pages use, and what the main
 * pointer is. CSS has the same rules as variants (globals.css: `wide:`, `short:`, `coarse:`), and scripts ask the
 * browser the very same media queries, so the canvas and the page can't disagree about the layout.
 */

/**
 * The song pages' wide layout (the cover beside the content) is for landscape screens 640 px wide and up: desktops,
 * iPads and phones held sideways. Portrait screens (phones, iPads held upright, tall windows) stack the cover above.
 */
export const WIDE_QUERY = "(orientation: landscape) and (min-width: 640px)";

/** A touch screen is the main pointer (phones, tablets): no hover, bigger targets, lighter rendering. */
export const COARSE_QUERY = "(pointer: coarse)";

/** A phone: a touch screen whose shorter side is under 640 px, held either way (iPads and desktops aren't). */
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 639px), (pointer: coarse) and (max-height: 639px)";

/** WIDE_QUERY worked out from a size (in Node, or before the page can be asked). */
export function isWide(W: number, H: number) {
  return W > H && W >= 640;
}

/** Whether a media query matches right now; false outside a browser. */
export function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** The wide layout right now, as CSS sees it. */
export const wideNow = () => matches(WIDE_QUERY);

/** The main pointer is a finger (phones, tablets). */
export const coarseNow = () => matches(COARSE_QUERY);

/** Opened on a phone (PHONE_QUERY). */
export const phoneNow = () => matches(PHONE_QUERY);

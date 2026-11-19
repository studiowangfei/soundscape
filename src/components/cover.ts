import type { CoverSize } from "../content/cover-rules";
import { matches, PHONE_QUERY } from "./env";

/**
 * The file the browser loads for a cover: the data says `/covers/<slug>.jpg` (the original, which isn't served), the
 * build makes `<slug>-1200.webp` and `<slug>-2048.webp` (scripts/sync-covers.mts). Anything else (artist photos, a URL
 * already mapped) is left as it is.
 */
export function coverAt(url: string, size: CoverSize = coverSize()): string {
  const m = /^\/covers\/([^/]+)\.jpg$/.exec(url);
  return m ? `/covers/${m[1]}-${size}.webp` : url;
}

/** Phones (PHONE_QUERY) load the 1,200 px covers; everything wider, and Node, the 2,048 px ones. */
export function coverSize(): CoverSize {
  return matches(PHONE_QUERY) ? 1200 : 2048;
}

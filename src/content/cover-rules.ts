/**
 * A cover's rules. The original, content/covers/<slug>.jpg: 1,200–2,048 px on its longest side (bigger sources scaled
 * down to 2,048, never up), JPEG quality 90, at most 2 MB. The build makes two WebPs from it (scripts/sync-covers.mts):
 * <slug>-1200.webp for phones and <slug>-2048.webp for wider screens (components/cover.ts picks one). No Node imports,
 * so the page's code can use it too.
 */
export const COVER = {
  minPx: 1200,
  maxPx: 2048,
  maxBytes: 2 * 1024 * 1024,
  jpegQuality: 90,
  webpQuality: 82,
  sizes: [1200, 2048] as const,
};

export type CoverSize = (typeof COVER.sizes)[number];

/**
 * Songs whose cover exists nowhere at 1,200 px, allowed smaller by name (user, 2026-11-06: the largest image that
 * exists rather than none). Every other song, and every new one, must reach COVER.minPx.
 */
export const SMALL_COVERS: Record<string, string> = {
  "ryuichi-sakamoto-once-in-a-lifetime": "Left Handed Dream: a 422×368 scan is all that exists",
  "david-lang-sumi-jo-simple-song-3": "Youth (Original Soundtrack Album): Deezer's 1,000 px is the largest anywhere",
};

/** The smallest a song's cover may be on its longest side. */
export function minCoverPx(slug: string): number {
  return slug in SMALL_COVERS ? 0 : COVER.minPx;
}

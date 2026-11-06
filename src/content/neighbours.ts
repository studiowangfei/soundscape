/**
 * A link to a song page: enough for a previous / next button, and for that page's backdrop to start building at the
 * click (its cover, as the backdrop loads it).
 */
export type SongLink = { slug: string; title: string; artist: string; cover: string; coverKind: "album" | "artist" };
export type Neighbours = { prev: SongLink; next: SongLink };

/**
 * The songs either side of `slug` in `songs` (the entries in their loaded order, the landing wheel's), looping like the
 * wheel: before the first is the last. Null for a lone song or one that isn't in the list.
 */
export function neighbours(songs: { slug: string; title: string; artist: string; cover: { file: string; kind: "album" | "artist" } }[], slug: string): Neighbours | null {
  const n = songs.length;
  const i = songs.findIndex((s) => s.slug === slug);
  if (i < 0 || n < 2) return null;
  const link = ({ slug, title, artist, cover }: (typeof songs)[number]): SongLink => ({ slug, title, artist, cover: `/covers/${cover.file}`, coverKind: cover.kind });
  return { prev: link(songs[(i - 1 + n) % n]), next: link(songs[(i + 1) % n]) };
}

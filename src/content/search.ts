import type { Entry } from "./schema";

/**
 * Lowercase, fold accents ("Beyoncé" -> "beyonce") and reduce punctuation to single spaces.
 * Derived from generator/match.ts (the app must not import from generator/), with two changes:
 * NFKD + combining-mark strip instead of NFKC, and no bracketed-qualifier stripping, since
 * for search "(feat. X)" text is something users may type and aliases like "Song (feat. X)" should stay findable.
 * CJK is untouched: \p{L} keeps it and Han characters carry no combining marks.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['\u2019\u2018`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type Searchable = Pick<Entry, "title" | "artist" | "aliases" | "tags">;

/** Every whitespace-separated query word must be a substring of title + artist + aliases + tags. Input order is kept. */
export function searchEntries<T extends Searchable>(entries: T[], query: string): T[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((e) => {
    const hay = normalize([e.title, e.artist, ...e.aliases, ...e.tags].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

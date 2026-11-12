/** How the landing wheel's songs can be ordered (the bar's sort menu), as pure functions so they're tested in Node. */

export type SortKey = "year" | "title" | "default";

/** The sort menu's options, in its order: a name, and what the order runs from and to. */
export const SORTS: { key: SortKey; label: string; detail?: string }[] = [
  { key: "default", label: "Default" },
  { key: "year", label: "Year of release", detail: "Oldest to Newest" },
  { key: "title", label: "Alphabetical", detail: "A to Z" },
];

/** Remembered in this browser, like a sort order on iOS and macOS. */
export const SORT_STORE = "soundscape.landing.sort";

/** The session key for the seed of the Default order's shuffle: a new order each visit, kept while you come and go. */
export const SHUFFLE_STORE = "soundscape.landing.shuffle";

export const isSortKey = (v: unknown): v is SortKey => SORTS.some((s) => s.key === v);

// Case, accents and punctuation don't count; numbers go by value ("Simple Song #3" before "#10").
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true, ignorePunctuation: true });

/**
 * The songs in `key` order: by release year, oldest first (songs without a year last; the same year by title); by
 * title, A to Z; or as given ("default", the same array; the landing page gives them shuffled).
 */
export function sortSongs<T extends { title: string; year: number | null }>(songs: T[], key: SortKey): T[] {
  if (key === "default") return songs;
  const byTitle = (a: T, b: T) => collator.compare(a.title, b.title);
  const byYear = (a: T, b: T) => (a.year ?? Infinity) - (b.year ?? Infinity) || byTitle(a, b);
  return [...songs].sort(key === "year" ? byYear : byTitle);
}

/** A new shuffle seed (a 32-bit integer), as text for sessionStorage. */
export const newShuffleSeed = () => String(Math.floor(Math.random() * 2 ** 32));

/** The songs shuffled by `seed` (the same seed, the same order), as a new array; an unusable seed leaves them as they are. */
export function shuffleSongs<T>(songs: T[], seed: string | null): T[] {
  const n = Number(seed);
  if (seed === null || !Number.isInteger(n)) return songs;
  // mulberry32
  let a = n >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const out = [...songs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The landing wheel's order: the catalogue shuffled by this visit's seed (the Default order), then sorted by `key`. A
 * song page's previous and next go by it too, so they step through the songs as the wheel lists them.
 */
export function landingOrder<T extends { title: string; year: number | null }>(songs: T[], seed: string | null, key: SortKey): T[] {
  return sortSongs(shuffleSongs(songs, seed), key);
}

/**
 * This visit's order, as any page reads it (browser only; the storages are passed in tests): the sort chosen, remembered
 * in this browser (else Default), and the visit's shuffle seed, made now if this is the visit's first page, so that the
 * pages after it (the landing page, other songs) all keep to the same order.
 */
export function visitOrder(local: Storage = globalThis.localStorage, session: Storage = globalThis.sessionStorage): { sort: SortKey; seed: string } {
  let saved: unknown = null;
  try {
    saved = local.getItem(SORT_STORE);
  } catch {
    // Blocked storage: the default order.
  }
  let seed: string | null = null;
  try {
    seed = session.getItem(SHUFFLE_STORE);
  } catch {
    // Blocked storage: a seed for this page alone.
  }
  if (seed === null) {
    seed = newShuffleSeed();
    try {
      session.setItem(SHUFFLE_STORE, seed);
    } catch {
      // Not remembered; fine.
    }
  }
  return { sort: isSortKey(saved) ? saved : "default", seed };
}

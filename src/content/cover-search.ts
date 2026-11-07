// Where a song's cover can be found large, for `npm run cover` (scripts/cover.mts): the edition the entry already
// points at (its cover.sourceUrl, asked for at full size), then the same album searched on iTunes (3,000 px art), the
// Cover Art Archive (the original upload) and Deezer (1,000 px). Public, keyless endpoints. No sharp here: the command
// downloads the candidates and measures them.

export type Candidate = {
  source: "itunes" | "caa" | "deezer";
  url: string;
  album: string;
  artist: string;
  /** The edition the entry already uses (from its cover.sourceUrl), not a search hit. */
  pinned?: boolean;
};

export type CoverQuery = { album: string; artist: string; sourceUrl?: string };

import { COVER } from "./cover-rules";

const UA = { "user-agent": "Soundscape/0.1 (cover lookup)", accept: "application/json" };

// Edition labels a store adds to the same album's name: "(Remastered 2011)", "[Deluxe Edition]", "(Expanded)"…
const EDITION = /\s*[([][^)\]]*\b(remaster(ed)?|deluxe|edition|expanded|anniversary|bonus|reissue)\b[^)\]]*[)\]]/gi;
const RELEASE_KIND = /\s+-\s+(single|ep)$/i;

const bare = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(EDITION, " ")
    .replace(RELEASE_KIND, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The same album, ignoring case, punctuation and edition labels. A " - Single" / " - EP" hit matches only the album
 * wanted of that exact name (when the entry's cover is the single), never a longer title it starts.
 */
export function albumMatches(found: string, wanted: string): boolean {
  return bare(found) !== "" && bare(found) === bare(wanted);
}

/** A single or EP named like the album never stands in for it: when the album itself is among the hits, only it counts. */
function albumsFirst<T>(hits: T[], name: (h: T) => string): T[] {
  const albums = hits.filter((h) => !RELEASE_KIND.test(name(h)));
  return albums.length ? albums : hits;
}

/** The artist the store credits is the song's (loosely: "Nick Cave & The Bad Seeds" matches "Nick Cave"). */
function artistMatches(found: string, wanted: string): boolean {
  const [x, y] = [bare(found), bare(wanted)];
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
}

const ITUNES_ART = /^https:\/\/[^/]*mzstatic\.com\//;
const CAA_ART = /^https:\/\/coverartarchive\.org\//;
const DEEZER_ART = /^https:\/\/[^/]*dzcdn\.net\//;

/** A cover URL asked for at its largest: iTunes art at 3,000 px, a CAA thumbnail's original upload; others as they are. */
export function fullSizeUrl(u: string): string {
  if (ITUNES_ART.test(u)) return u.replace(/\/[^/]*\d+x\d+[a-z]*(-\d+)?\.(jpg|png|webp)$/i, "/3000x3000bb.jpg");
  if (CAA_ART.test(u)) return u.replace(/-(250|500|1200)\.jpg$/, ".jpg");
  return u;
}

// Where the Cover Art Archive's links redirect: an archive.org storage node, whose host changes over time.
const ARCHIVE_NODE = /^https:\/\/[^/]+\.archive\.org\/.*\/mbid-([0-9a-f-]{36})-(\d+)\.(jpg|png|gif)$/i;

/**
 * The URL to record for an image: a Cover Art Archive image by its stable archive URL (release and image id), even when
 * it was asked for as a release group's front cover or came back from a storage node; any other image as asked for.
 */
export function canonicalCoverUrl(asked: string, final: string = asked): string {
  const node = ARCHIVE_NODE.exec(final) ?? ARCHIVE_NODE.exec(asked);
  return node ? `https://coverartarchive.org/release/${node[1]}/${node[2]}.${node[3].toLowerCase()}` : asked;
}

/** The edition the entry already uses, at its largest. */
function fromSourceUrl(q: CoverQuery): Candidate | null {
  const u = q.sourceUrl && canonicalCoverUrl(q.sourceUrl);
  const source = !u ? null : ITUNES_ART.test(u) ? "itunes" : CAA_ART.test(u) ? "caa" : DEEZER_ART.test(u) ? "deezer" : null;
  return source && { source, url: fullSizeUrl(u!), album: q.album, artist: q.artist, pinned: true };
}

type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

type ItunesAlbum = { collectionName?: string; artistName: string; artworkUrl100?: string; artistId?: number };

/** The album on iTunes; its search index misses some albums, so then the artist's own album list is asked too. */
async function itunes(q: CoverQuery, f: Fetch, ms: number): Promise<Candidate[]> {
  const ask = async (params: Record<string, string>, path = "search") =>
    ((await getJson(f, `https://itunes.apple.com/${path}?${new URLSearchParams(params)}`, ms)) as { results?: ItunesAlbum[] }).results ?? [];
  const pick = (results: ItunesAlbum[]) => {
    const hits = results.filter((r) => r.artworkUrl100 && r.collectionName && albumMatches(r.collectionName, q.album) && artistMatches(r.artistName, q.artist));
    return albumsFirst(hits, (r) => r.collectionName!).map((r): Candidate => ({ source: "itunes", url: fullSizeUrl(r.artworkUrl100!), album: r.collectionName!, artist: r.artistName }));
  };
  const found = pick(await ask({ term: `${q.artist} ${q.album}`, entity: "album", limit: "25" }));
  if (found.length) return found;
  const artist = (await ask({ term: q.artist, entity: "musicArtist", limit: "5" })).find((r) => r.artistId && artistMatches(r.artistName, q.artist));
  return artist ? pick(await ask({ id: String(artist.artistId), entity: "album", limit: "200" }, "lookup")) : [];
}

async function caa(q: CoverQuery, f: Fetch, ms: number): Promise<Candidate[]> {
  const quote = (s: string) => s.replace(/["\\]/g, " ");
  const query = `releasegroup:"${quote(q.album)}" AND artist:"${quote(q.artist)}"`;
  const url = `https://musicbrainz.org/ws/2/release-group/?${new URLSearchParams({ query, fmt: "json", limit: "10" })}`;
  const data = (await getJson(f, url, ms)) as { "release-groups"?: { id: string; title: string; "artist-credit"?: { name: string }[] }[] };
  const hit = (data["release-groups"] ?? []).find((g) => albumMatches(g.title, q.album) && (g["artist-credit"] ?? []).some((c) => artistMatches(c.name, q.artist)));
  // The release group's front cover redirects to the original upload of its chosen release.
  return hit ? [{ source: "caa", url: `https://coverartarchive.org/release-group/${hit.id}/front`, album: hit.title, artist: q.artist }] : [];
}

async function deezer(q: CoverQuery, f: Fetch, ms: number): Promise<Candidate[]> {
  const url = `https://api.deezer.com/search/album?${new URLSearchParams({ q: `artist:"${q.artist}" album:"${q.album}"` })}`;
  const { data = [] } = (await getJson(f, url, ms)) as { data?: { title: string; artist?: { name: string }; cover_xl?: string }[] };
  const hits = data.filter((d) => d.cover_xl && albumMatches(d.title, q.album) && artistMatches(d.artist?.name ?? "", q.artist));
  return albumsFirst(hits, (d) => d.title).map((d) => ({ source: "deezer", url: d.cover_xl!, album: d.title, artist: d.artist!.name }));
}

/**
 * Every candidate for the entry's album: the pinned edition first, then iTunes, the Cover Art Archive (searched only
 * when the pinned one isn't from there) and Deezer. Each source gets `timeoutMs`; one that fails or hangs is named in
 * `failed` and the rest still count. Duplicate URLs are dropped.
 */
export async function findCandidates(q: CoverQuery, fetchImpl: Fetch = fetch, timeoutMs = 20_000): Promise<{ candidates: Candidate[]; failed: string[] }> {
  const pinned = fromSourceUrl(q);
  type Source = [Candidate["source"], (q: CoverQuery, f: Fetch, ms: number) => Promise<Candidate[]>];
  const sources: Source[] = [["itunes", itunes], ["caa", caa], ["deezer", deezer]];
  if (pinned?.source === "caa") sources.splice(1, 1);
  const settled = await Promise.allSettled(sources.map(([, find]) => find(q, fetchImpl, timeoutMs)));
  const failed = sources.filter((_, i) => settled[i].status === "rejected").map(([name]) => name);
  const found = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const seen = new Set<string>();
  const candidates = [...(pinned ? [pinned] : []), ...found].filter((c) => !seen.has(c.url) && seen.add(c.url));
  return { candidates, failed };
}

/**
 * Which measured candidate to save, of those at least `minPx` on their longest side: the current edition when it
 * already reaches 2,048 px; else the plain album (no edition label) before a remaster, deluxe or anniversary edition,
 * which may carry different art; then the largest. `replaced` is a usable current edition that lost, so the command can
 * say the art may have changed.
 */
export function chooseCover<T extends { album?: string; pinned?: boolean; width: number; height: number }>(measured: T[], minPx: number): { pick?: T; replaced?: T } {
  const longest = (m: T) => Math.max(m.width, m.height);
  const labelled = (m: T) => (m.album ?? "").replace(EDITION, "") !== (m.album ?? "");
  const usable = measured.filter((m) => longest(m) >= minPx);
  const pinned = usable.find((m) => m.pinned);
  if (pinned && longest(pinned) >= COVER.maxPx) return { pick: pinned };
  const pick = [...usable].sort((a, b) => Number(labelled(a)) - Number(labelled(b)) || longest(b) - longest(a))[0];
  return { pick, replaced: pinned && pick !== pinned ? pinned : undefined };
}

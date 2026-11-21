/**
 * The content the iPhone app reads (docs/plans/2026-11-21-ios-app.md), made at build time from the same entries and
 * approved visitor comments the site is built from, by scripts/sync-app-content.mts, into public/app/v1/:
 * - index.json: every song, with what the landing wheel, search and sorting need, and the file that holds the rest;
 * - songs/<slug>.<hash>.json: the entry (less its research notes, never shown), its approved visitor comments, and
 *   `show`: what the site works out for showing them (cover files, streaming links, each card's label, source line and
 *   icon, video or poster). The site's own functions decide it, so the app shows what the site would (the site leads).
 * A song's file is named by a hash of its contents, so it can be cached for good; index.json lists the current ones.
 * Songs the deploy agent adds and comments the user approves reach the app with the next deploy, with nothing to do.
 * Pure (no file system), so it's tested in Node.
 */
import { createHash } from "node:crypto";
import { cardMedia, TYPE_LABEL } from "../components/cards/meta";
import { attribution, iconUrl, visitorAttribution } from "../components/cards/sources";
import { coverAt } from "../components/cover";
import { streamLinks, type StreamLinks } from "../components/player/stream-links";
import type { CoverSize } from "./cover-rules";
import type { Entry } from "./schema";
import type { VisitorComment } from "./visitors";

/** The format's version: a change the app's builds already out there couldn't read goes to a new folder (app/v2). */
export const APP_FORMAT = 1;
/** Where it goes, under public/ (and so the URL path the app reads it from). */
export const APP_DIR = "app/v1";

/**
 * The app's id as the Apple developer team and bundle id ("TEAMID.bundle.id"), once the user has them: with it set, the
 * build serves /.well-known/apple-app-site-association, so a song page's link opens that song in the app.
 */
export const IOS_APP_ID: string | null = null;

/** A short fingerprint of a file's contents. */
export const contentHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export type Covers = Record<CoverSize, string>;

/** A card as the site shows it: its label, its source line (on the tile and opened) and icon, its video or poster. */
export type AppCard = {
  label: string;
  source: { domain: string; inset: boolean; tile: string; open: string; icon: string; mono: string };
  media: ReturnType<typeof cardMedia>;
};

export type AppSong = {
  format: typeof APP_FORMAT;
  entry: Omit<Entry, "provenance">;
  /** Newest first, as the row shows them. */
  visitorComments: VisitorComment[];
  show: {
    covers: Covers;
    links: StreamLinks;
    cards: Record<string, AppCard>;
    /** Each visitor comment's source line, on the tile and opened, by id. */
    visitors: Record<string, { tile: string; open: string }>;
  };
};

export type AppIndexSong = Pick<Entry, "slug" | "title" | "artist" | "aliases" | "tags" | "releaseYear" | "addedAt" | "preview"> & {
  cover: { kind: Entry["cover"]["kind"] } & Covers;
  /** The song's file, under app/v1/, and its fingerprint. */
  file: string;
  hash: string;
};

export type AppIndex = {
  format: typeof APP_FORMAT;
  /** A fingerprint of everything below: unchanged, the app has nothing new to fetch. */
  content: string;
  songs: AppIndexSong[];
  /** The Chinese typeface's files (the site's own subset, WOFF2, which iOS loads as it is), or null when no song has Chinese. */
  cjkFont: { key: string; files: string[] } | null;
};

/** A cover's two files, as the site serves them (components/cover.ts). */
const coversOf = (entry: Pick<Entry, "cover">): Covers => ({ 1200: coverAt(`/covers/${entry.cover.file}`, 1200), 2048: coverAt(`/covers/${entry.cover.file}`, 2048) });

/** A song's file for the app. `icons`: its cards' sites' icon fingerprints (content/icon-versions.ts), by domain. */
export function appSong(entry: Entry, comments: VisitorComment[], icons: Record<string, string>): AppSong {
  const shown: Omit<Entry, "provenance"> & { provenance?: unknown } = { ...entry };
  delete shown.provenance;
  const cards: Record<string, AppCard> = {};
  for (const card of entry.cards) {
    const tile = attribution(card, false);
    const open = attribution(card, true);
    const version = icons[tile.domain];
    cards[card.id] = {
      label: TYPE_LABEL[card.type],
      source: { domain: tile.domain, inset: tile.inset, tile: tile.text, open: open.text, icon: iconUrl(tile.domain, version), mono: iconUrl(tile.domain, version, "mono") },
      media: cardMedia(card),
    };
  }
  const visitors = Object.fromEntries(comments.map((c) => [c.id, { tile: visitorAttribution(c, false), open: visitorAttribution(c, true) }]));
  return { format: APP_FORMAT, entry: shown, visitorComments: comments, show: { covers: coversOf(entry), links: streamLinks(entry), cards, visitors } };
}

/** Where a song's file goes, under app/v1/. */
export const songFile = (slug: string, hash: string) => `songs/${slug}.${hash}.json`;

/** The index, from the entries (in their order) and each song's file fingerprint, by slug. */
export function appIndex(entries: Entry[], hashes: Map<string, string>, cjkFont: AppIndex["cjkFont"]): AppIndex {
  const songs: AppIndexSong[] = entries.map((e) => {
    const hash = hashes.get(e.slug);
    if (!hash) throw new Error(`no app file for ${e.slug}`);
    return {
      slug: e.slug,
      title: e.title,
      artist: e.artist,
      aliases: e.aliases,
      tags: e.tags,
      releaseYear: e.releaseYear,
      addedAt: e.addedAt,
      ...(e.preview ? { preview: e.preview } : {}),
      cover: { kind: e.cover.kind, ...coversOf(e) },
      file: songFile(e.slug, hash),
      hash,
    };
  });
  const content = contentHash(JSON.stringify([songs.map((s) => s.hash), cjkFont]));
  return { format: APP_FORMAT, content, songs, cjkFont };
}

/** The Chinese typeface's files and key, from the stylesheet scripts/sync-cjk-font.mts writes ("" or no key: none). */
export function cjkFontFiles(css: string, urls: string[]): AppIndex["cjkFont"] {
  const key = /key: ([0-9a-f]+)/.exec(css)?.[1];
  return key && urls.length ? { key, files: urls } : null;
}

/** The apple-app-site-association file: song pages (/songs/<slug>) open in the app. */
export function appSiteAssociation(appId: string) {
  return { applinks: { details: [{ appIDs: [appId], components: [{ "/": "/songs/*", comment: "a song page opens that song in the app" }] }] } };
}

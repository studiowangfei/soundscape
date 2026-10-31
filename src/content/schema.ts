import { z } from "zod";

const httpUrl = z.url().refine((u) => /^https?:\/\//i.test(u), "must be an http(s) URL");

const isoDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "YYYY, YYYY-MM or YYYY-MM-DD");

export const CARD_TYPES = ["background", "comment", "version", "film", "lyric"] as const;

export const EntryCardSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(CARD_TYPES),
    headline: z.string().min(1),
    snippet: z.string().min(1),
    context: z.string().default(""),
    source: z.object({ name: z.string(), platform: z.string() }),
    url: httpUrl,
    sourceDate: isoDate.nullable(),
    supporting: z.array(z.object({ label: z.string(), url: httpUrl })).optional(),
    comment: z
      .object({
        author: z.string().nullable(),
        commentId: z.string().nullable(),
        likesObserved: z.number().nullable(),
        observedAt: isoDate.nullable(),
        replies: z
          .array(z.object({ author: z.string().nullable(), commentId: z.string().nullable(), text: z.string().min(1), likesObserved: z.number().nullable() }).strict())
          .max(2)
          .optional(),
      })
      .optional(),
    version: z
      .object({
        performer: z.string(),
        versionLabel: z.string(),
        popularityObserved: z.string().nullable(),
        observedAt: isoDate.nullable(),
      })
      .optional(),
    film: z
      .object({
        association: z.string(),
        plotDetails: z.string().optional(),
        // The cited film or show, used to find its poster. `year` is its release year (for a show, the year the episode aired).
        title: z.string().min(1),
        year: z.number().int().nullable().optional(),
        kind: z.enum(["film", "tv"]).default("film"),
        poster: z.object({ file: z.string().min(1), sourceUrl: httpUrl.optional() }).strict().optional(),
      })
      .strict()
      .optional(),
    lyric: z
      .object({
        excerptOrTimestamp: z.string(),
        lyricSource: z.string(),
        reusePermission: z.string(),
        selectionBasis: z.enum(["editorial", "observed_frequency"]),
        selectionNote: z.string().optional(),
        reactionCardIds: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((card, ctx) => {
    for (const t of ["comment", "version", "film", "lyric"] as const) {
      if (card.type === t && !card[t]) {
        ctx.addIssue({
          code: "custom",
          path: [t],
          message: `${t} card requires a "${t}" object`,
        });
      }
    }
  });

export const EntrySchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ASCII kebab-case"),
    title: z.string().min(1),
    artist: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    releaseYear: z.number().int().nullable().optional(),
    addedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    youtubeUrl: httpUrl.nullable().optional(),
    spotifyId: z.string().nullable().optional(),
    // The song on YouTube Music (a video id, usually the artist's "- Topic" audio); with spotifyId and the preview's
    // store link, it's where the player's Spotify / Apple Music / YouTube Music icons go (generator/streams.ts).
    youtubeMusicId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "YouTube video id").nullable().optional(),
    // An official 30-second preview clip (iTunes), streamed from the store; `link` is the store page it must credit.
    preview: z.object({ url: httpUrl, source: z.literal("itunes"), link: httpUrl }).optional(),
    cover: z
      .object({
        file: z.string().min(1),
        kind: z.enum(["album", "artist"]).default("album"),
        album: z.string().optional(),
        sourceUrl: httpUrl.optional(),
      })
      .strict(),
    // Up to 8 regular cards plus, on top, one lyric card (the 9th card).
    cards: z.array(EntryCardSchema).min(1).max(9),
    // Free-form generation details; never rendered.
    provenance: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const lyrics = entry.cards.filter((c) => c.type === "lyric");
    const regular = entry.cards.length - lyrics.length;
    if (regular > 8) ctx.addIssue({ code: "custom", path: ["cards"], message: `at most 8 cards plus one lyric card (has ${regular} regular cards)` });
    if (lyrics.length > 1) ctx.addIssue({ code: "custom", path: ["cards"], message: `only one lyric card per entry (has ${lyrics.length})` });
    // A lyric card names the comment cards that quote its line.
    const comments = new Set(entry.cards.filter((c) => c.type === "comment").map((c) => c.id));
    entry.cards.forEach((c, i) => {
      for (const id of c.lyric?.reactionCardIds ?? []) {
        if (!comments.has(id)) ctx.addIssue({ code: "custom", path: ["cards", i, "lyric", "reactionCardIds"], message: `"${id}" is not a comment card in this entry` });
      }
    });
  });

export type CardType = (typeof CARD_TYPES)[number];
export type EntryCard = z.infer<typeof EntryCardSchema>;
export type Entry = z.infer<typeof EntrySchema>;

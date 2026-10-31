# Content

Each song is one file, `content/songs/<slug>.json`, with its cover image in `content/covers/` and any film posters in `content/posters/`. The site is built from these files; there is no database.

Validate with `npm run content:check` before pushing. Schema: `src/content/schema.ts`. Unknown keys are errors.

## Adding a song

1. Add `content/songs/<slug>.json` and `content/covers/<slug>.jpg`.
2. Fill the player's preview and streaming links (`preview`, `spotifyId`, `youtubeMusicId`; see Entry fields).
3. Run `npm run content:check`. It lists every problem as `<file>: <message>`.
4. Push. The build runs the same check and stops on any bad entry.

## Making a cover

Covers must be JPEG, at most 250 KB. On macOS, the built-in `sips` does it (PNG input works too):

```
sips -Z 800 -s format jpeg -s formatOptions 65 <input> --out content/covers/<slug>.jpg
```

If the result is still over 250 KB, lower `formatOptions` (for example 50).

## Entry fields

- `slug` (string): must equal the file name without `.json`.
- `title`, `artist` (string)
- `aliases` (string[], default `[]`)
- `releaseYear` (integer or null, optional)
- `addedAt` (`YYYY-MM-DD`): newest entries are listed first.
- `summary` (string, optional)
- `tags` (string[], default `[]`)
- `youtubeUrl` (URL or null, optional): the song's official video.
- `preview` (optional): `{ url, source: "itunes", link }`, the official 30-second preview the player plays, and `link`
  its Apple Music page.
- `spotifyId`, `youtubeMusicId` (string or null, optional): the song's Spotify track and YouTube Music video. With
  `preview.link`, they're where the player's Spotify, Apple Music and YouTube Music icons go; a missing one searches
  that service for the song instead.
- `cover`: `{ file, kind: "album" | "artist" (default "album"), album?, sourceUrl? }`
- `cards`: 1 to 9 cards: up to 8 regular cards plus at most one lyric card (see Lyric card below).
- `provenance` (object, optional): free-form generation details, never rendered.

## Card fields

`id`, `type` (`background` | `comment` | `version` | `film` | `lyric`), `headline`, `snippet`, `context` (default `""`), `source: { name, platform }`, `url`, `sourceDate` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`, or null), `supporting: [{ label, url }]` (optional).

A card of type `comment`, `version`, `film` or `lyric` must also carry the object of the same name:

- `comment`: `{ author (string or null), commentId (string or null), likesObserved (number or null), observedAt (date or null), replies? }`. The quoted comment's attribution and engagement when observed. `replies` (optional, at most 2): `[{ author, commentId, text, likesObserved }]`, the comment's most-liked replies.
- `version`: `{ performer, versionLabel, popularityObserved (string or null), observedAt (date or null) }`. Who performs this cover/remix/live version and how popular it was.
- `film`: `{ association, plotDetails?, title, year? (integer or null), kind ("film" | "tv", default "film"), poster? }`. Which film or show uses the song; `title` names it. `poster: { file, sourceUrl? }` shows its poster on the card; without it the card is text only.
- `lyric`: `{ excerptOrTimestamp, lyricSource, reusePermission, selectionBasis ("editorial" | "observed_frequency"), selectionNote?, reactionCardIds? (string[]) }`. The lyric excerpt (or timestamp), where it came from, reuse status, and why it was chosen.

Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. All URLs must be http or https.

Card ID convention: `<slug>-<suffix>` (for example `a-song-comment-1`), unique across all entries, and never changed once published.

## Rules

- Card IDs are permanent and unique across all files. Never rename or reuse one.
- Cards render in file order: Background → Lyric → Comments → Version → Film. New entries number their card ids in that
  order (`<slug>-g1`, `-g2`, …); existing ids are never renumbered.

## Lyric card

The optional 9th card highlights one line listeners keep quoting. It doesn't take any other card's slot.

- Only on observed evidence: `selectionBasis: "observed_frequency"`, with `selectionNote` saying what was seen (e.g. how many
  top comments quote the line) and `reactionCardIds` listing the comment cards in this entry that quote it (checked: each must
  be a comment card here).
- `excerptOrTimestamp` is the quoted line: a short excerpt only. `lyricSource` says where it's from (stored, not shown).
- The collapsed card shows the "Lyric" label, the quoted line and the source line; the expanded card shows the line, then
  `snippet` (the story or meaning behind it) and `context` (a fan reaction or another take; may be empty), then the source
  line. `headline` is stored, not shown. Never say where the line sits in the song (verse, chorus, opening line…).
- `cover.file` must be `<slug>.jpg`; `slug` is ASCII kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`). Covers live in `content/covers/<slug>.jpg`, must exist, and must be at most 250 KB.
- `film.poster.file` must be `<card id>.jpg`. Posters live in `content/posters/<card id>.jpg`, must exist, and must be at most 250 KB. Make one like a cover.
- Run `npm run content:check` before pushing.

## Example

A complete entry:

```json
{
  "slug": "a-song",
  "title": "Alpha Song",
  "artist": "The Examples",
  "aliases": [],
  "releaseYear": 2001,
  "addedAt": "2026-10-02",
  "summary": "A short fixture song used in tests and the README.",
  "tags": ["fixture"],
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "spotifyId": null,
  "cover": { "file": "a-song.jpg", "kind": "album", "album": "Alpha Song (Single)" },
  "cards": [
    {
      "id": "a-song-background-1",
      "type": "background",
      "headline": "Written in one night",
      "snippet": "The band wrote the song in a single late-night session before the studio booking ended.",
      "context": "Recounted in a retrospective interview.",
      "source": { "name": "Example Magazine", "platform": "web" },
      "url": "https://example.com/interview/a-song",
      "sourceDate": "2019-05-01"
    },
    {
      "id": "a-song-comment-1",
      "type": "comment",
      "headline": "Still hits in 2024",
      "snippet": "Played this at my dad's farewell. He would have loved it.",
      "context": "",
      "source": { "name": "YouTube", "platform": "youtube" },
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "sourceDate": "2024-03-10",
      "comment": { "author": "@someone", "commentId": null, "likesObserved": 1200, "observedAt": "2024-03-10" }
    }
  ],
  "provenance": { "generator": "hand-written fixture" }
}
```

`slug` matches `a-song.json`; `cover.file` points at `content/covers/a-song.jpg`; the `comment` card has its `comment` object; `provenance` is ignored by the site.

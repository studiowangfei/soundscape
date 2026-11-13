# Adding a song

You're adding songs to the Soundscape site. This repo is the whole site: a Next.js app that Vercel rebuilds and
publishes on every push. Songs are data, never code or HTML: adding one means adding files to `content/` and pushing.
Nothing else in the repo changes.

## Visitor comments: never overwrite

`content/visitor-comments/` holds comments visitors left on song pages and the site's owner approved. They exist
**only in this repo**: the site's packages (`dist.zip`) never contain that folder.

- When you apply a new `dist.zip`, keep the repo's `content/visitor-comments/` exactly as it is. Never delete, replace
  or empty it.
- Don't edit, move or delete a visitor comment unless the owner asks. To take a published comment down, delete its
  file (`content/visitor-comments/<slug>/<id>.json`) in a commit of its own.
- Pull requests from `visitor/…` branches, labelled `visitor-comment`, are visitors' comments waiting for the owner.
  Don't merge, close or change them yourself.

How to research the song and write its cards is in the design doc you were given (`card-generation-design.md`). This
brief covers what to deliver here and how to check it.

## What to deliver

| File | When | What |
|---|---|---|
| `content/songs/<slug>.json` | always | the entry: the song and its cards |
| `content/covers/<slug>.jpg` | always | its cover |
| `content/posters/<card id>.jpg` | a film card with a poster | the film's or show's poster |
| `content/icons/<domain>.png` | a card cites a site with no icon yet | the site's icon (`npm run icons`, see Icons) |
| `content/icons/<domain>.mono.png` | with every new icon | its one-colour mark for collapsed cards (the same command) |

### The slug

Artist, then title, in ASCII kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`): `beyonce-sorry`,
`charli-xcx-sympathy-is-a-knife-feat-ariana-grande`, `cui-jian-lan-se-gu-tou` (Chinese romanised). It names the entry
file and the cover. Look in `content/songs/` first: if the song is already there, stop and say so.

### The entry

Fields, rules and a complete example: `content/README.md`. The exact schema: `src/content/schema.ts`. Unknown keys are
errors. In short:

- `slug`, `title`, `artist`, `aliases`, `tags`, `releaseYear`, and `addedAt` (today, `YYYY-MM-DD`). `releaseYear` is
  the year the song's album came out, the album on its cover (Four Tet's "Teenage Birdsong" is 2020, Sixteen Oceans,
  not 2019, its single); a song on no album gets the year it first came out. Never a reissue's or a compilation's year;
  MusicBrainz's first-release date for the album is a good start, checked against what you know. The landing page's sort
  menu orders songs by it; a song without one sorts last.
- `cover`: `{ file: "<slug>.jpg", kind: "album" | "artist", album?, sourceUrl? }`.
- `preview`: `{ url, source: "itunes", link }`, the song's 30-second Apple Music preview (design doc §9.3).
- `spotifyId`, `youtubeMusicId` (an 11-character video id) and `youtubeUrl`: null when not found (the player then
  searches that service instead).
- `cards`: at most 8, mixed as in design doc §7; on top of them, up to 2 **film cards**, only for a strong use of the
  song in a film or show and never a film and its sequel (design doc §10), and an optional **lyric card** (design doc §7.1)
  when listeners are seen quoting a line. In the order they show: Background → Lyric → Comments → Version → Film. Card ids are `<slug>-g<n>`,
  numbered in that order, unique across the repo, and permanent.
- `provenance` (optional): your research notes and generation details; never shown.

### The cover

The rule (design doc §9.1): the cover of the studio album the song is on; single art only if it was never on an album;
the artist's photo only if nothing matches (then `kind: "artist"`).

Write the entry first (with `cover.album`, the album whose cover it is), then let the repo find the image:

```
npm ci                        # once
npm run cover <slug>          # finds the largest copy of that album's cover, saves content/covers/<slug>.jpg
```

It searches iTunes, the Cover Art Archive and Deezer for `cover.album` by the song's artist, keeps the largest that
matches (at least 1,200 px, scaled down to 2,048 px, JPEG), and sets `cover.sourceUrl`. Then **look at the saved
image**: it must be that album's usual cover, not a remaster, deluxe or single sleeve with different art. When the
command prints "note: this replaces the current edition", compare the new image with the old one before keeping it.

- `npm run cover <slug> -- --list` shows every candidate with its size and writes nothing.
- `npm run cover <slug> -- --url <image-url>` saves that image instead (still at least 1,200 px). Use it when the pick
  is the wrong edition, or for an artist photo.
- "no cover of at least 1200 px": nothing big enough exists under that album name. Try `--list` (other spellings of
  the album turn up as candidates) or find one by hand for `--url`; if there is none, tell the owner and leave the song
  out. Never upscale a small image to pass the check.

Don't make WebPs or resize by hand: the build turns each cover into the two sizes the site serves
(`<slug>-1200.webp` for phones, `<slug>-2048.webp` for wider screens).

### Posters

For film cards (design doc §9.2): `content/posters/<card id>.jpg`, named in the card's `film.poster.file`: JPEG, at most
800 px and 250 KB. On macOS: `sips -Z 800 -s format jpeg -s formatOptions 65 <image> --out content/posters/<card id>.jpg`
(still over 250 KB: `formatOptions 50`). No confident match: leave `poster` out, and the card shows text only.

### Icons

Each card shows its source site's icon, `content/icons/<domain>.png`: a 64×64 PNG, the domain without `www.` or `m.`
(all of Wikipedia is `wikipedia.org`, YouTube `youtube.com`, Douban `douban.com`). Collapsed cards draw it as a one-colour
mark, `content/icons/<domain>.mono.png`. A site missing either shows no icon there, so every site your cards cite needs
both.

When a card cites a site that has no icon yet (`npm run content:check` warns: `warning: no icon for <domain> …`), run:

```
npm run icons
```

It saves the icon of every cited site that lacks one (from Google's favicon service) and makes the marks that are missing
(it never touches existing ones). Look at the new `<domain>.png`: if it's a generic globe rather than the site's logo, put
the site's own 64×64 icon there instead and run `npm run icons` again for its mark. Commit both files with the song.

## Before you push

```
npm ci                  # once
npm run content:check   # must end with "N entries OK", with no "no icon" warning
npm run build           # optional: builds the whole site (about 30 s)
```

The check lists each problem as `<file>: <message>`. Vercel runs the same check on every push and won't publish a bad
entry (the live site keeps its last good version), but catch problems here.

A song with Chinese in it needs nothing extra: every build makes the site's Chinese font (Noto Serif SC) from the
characters in `content/`, fetching it from Google Fonts (`scripts/sync-cjk-font.mts`; the build log says "made the
Chinese typeface: … for N characters"). So `npm run build` needs a network connection.

## Pushing

- One song per commit, titled `Add <Artist> – <Title>`.
- Only add files under `content/`. Don't change `src/`, the configs, `package*.json`, other songs or
  `content/visitor-comments/` (see Visitor comments).
- Never rename, renumber or reuse a card id, and never change a published song's slug: posters are filed by card id,
  and pages by slug.
- To take a song down, revert its commit, and in the same commit delete its visitor comments
  (`content/visitor-comments/<slug>/`, if there is one): they belong to the song.

## What to skip in the design doc

The doc describes the pipeline as it runs in another workspace. These parts don't exist in this repo: the catalog record
(`catalog/songs/…`, §4 step 8), `export-entries.mts` and every other script in `generator/` and `tools/` (§4 step 9,
§9.4, §13), and that workspace's checks (`npm test`, `export_song_cards.py`). Here, the entry file in `content/songs/`
is what's published. Everything else applies: cleaning the input and gathering sources (§5), writing (§6), checks and
the card mix (§7, §8), assets (§9), quality and editorial judgement (§10, §11) and the entry format (§12).

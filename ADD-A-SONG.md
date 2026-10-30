# Adding a song

You're adding songs to the Soundscape site. This repo is the whole site: a static Next.js app that Vercel rebuilds and
publishes on every push. Songs are data, never code or HTML: adding one means adding files to `content/` and pushing.
Nothing else in the repo changes.

How to research the song and write its cards is in the design doc you were given (`card-generation-design.md`). This
brief covers what to deliver here and how to check it.

## What to deliver

| File | When | What |
|---|---|---|
| `content/songs/<slug>.json` | always | the entry: the song and its cards |
| `content/covers/<slug>.jpg` | always | its cover |
| `content/posters/<card id>.jpg` | a film card with a poster | the film's or show's poster |
| `content/icons/<domain>.png` | a card cites a site with no icon yet | the site's icon |

### The slug

Artist, then title, in ASCII kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`): `beyonce-sorry`,
`charli-xcx-sympathy-is-a-knife-feat-ariana-grande`, `cui-jian-lan-se-gu-tou` (Chinese romanised). It names the entry
file and the cover. Look in `content/songs/` first: if the song is already there, stop and say so.

### The entry

Fields, rules and a complete example: `content/README.md`. The exact schema: `src/content/schema.ts`. Unknown keys are
errors. In short:

- `slug`, `title`, `artist`, `aliases`, `tags`, `releaseYear`, and `addedAt` (today, `YYYY-MM-DD`).
- `cover`: `{ file: "<slug>.jpg", kind: "album" | "artist", album?, sourceUrl? }`.
- `preview`: `{ url, source: "itunes", link }`, the song's 30-second Apple Music preview (design doc §9.3).
- `spotifyId`, `youtubeMusicId` (an 11-character video id) and `youtubeUrl`: null when not found (the player then
  searches that service instead).
- `cards`: at most 8, in the order they show, mixed as in design doc §7. Card ids are `<slug>-g<n>`, unique across the
  repo, and permanent.
- `provenance` (optional): your research notes and generation details; never shown.

### The cover

The rule (design doc §9.1): the cover of the studio album the song is on; single art only if it was never on an album;
the artist's photo only if nothing matches (then `kind: "artist"`). JPEG, at most 800 px and 250 KB. On macOS:

```
sips -Z 800 -s format jpeg -s formatOptions 65 <image> --out content/covers/<slug>.jpg
```

Still over 250 KB: use `formatOptions 50`.

### Posters

For film cards (design doc §9.2): `content/posters/<card id>.jpg`, named in the card's `film.poster.file`, with the same
limits as a cover. No confident match: leave `poster` out, and the card shows text only.

### Icons

Each card shows its source site's icon, `content/icons/<domain>.png`: a 64×64 PNG, the domain without `www.` or `m.`
(all of Wikipedia is `wikipedia.org`, YouTube `youtube.com`, Douban `douban.com`). A missing icon is simply hidden, so add one for a new
site when you can.

## Before you push

```
npm ci                  # once
npm run content:check   # must end with "N entries OK"
npm run build           # optional: builds the whole site (about 30 s)
```

The check lists each problem as `<file>: <message>`. Vercel runs the same check on every push and won't publish a bad
entry (the live site keeps its last good version), but catch problems here.

## Pushing

- One song per commit, titled `Add <Artist> – <Title>`.
- Only add files under `content/`. Don't change `src/`, the configs, `package*.json` or other songs.
- Never rename, renumber or reuse a card id, and never change a published song's slug: posters are filed by card id,
  and pages by slug.
- To take a song down, revert its commit.

## What to skip in the design doc

The doc describes the pipeline as it runs in another workspace. These parts don't exist in this repo: the catalog record
(`catalog/songs/…`, §4 step 8), `export-entries.mts` and every other script in `generator/` and `tools/` (§4 step 9,
§9.4, §13), and that workspace's checks (`npm test`, `export_song_cards.py`). Here, the entry file in `content/songs/`
is what's published. Everything else applies: cleaning the input and gathering sources (§5), writing (§6), checks and
the card mix (§7, §8), assets (§9), quality and editorial judgement (§10, §11) and the entry format (§12).

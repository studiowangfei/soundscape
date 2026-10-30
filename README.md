# Soundscape

The Soundscape site: a wheel of songs, each with a page of cards about it. A static Next.js site built from the files
in `content/`; there is no database or server.

## Deploying

Push this folder to GitHub and connect the repo to Vercel (it detects Next.js; no settings needed). Every push
rebuilds and publishes the site. The build first checks every song (`npm run content:check`) and stops on a bad
entry, so a broken song never goes live.

## Adding a song

Add `content/songs/<slug>.json` and its cover `content/covers/<slug>.jpg` (plus any film posters in
`content/posters/` and icons for new source sites in `content/icons/`), then push. Step by step: `ADD-A-SONG.md`. The
format and rules: `content/README.md`; the full schema: `src/content/schema.ts`.

## Running it locally

```
npm install
npm run dev            # http://localhost:3000
npm run content:check  # check the songs
npm run build          # the static site, in out/
```

# Soundscape

The Soundscape site: a wheel of songs, each with a page of cards about it. A Next.js site built from the files in
`content/`, every page prerendered; no database.

## Deploying

Push this folder to GitHub and connect the repo to Vercel (it detects Next.js; no settings needed). Every push
rebuilds and publishes the site. The build first checks every song (`npm run content:check`) and stops on a bad
entry, so a broken song never goes live.

## Visitor comments

Each song page ends with a card where visitors can leave a comment. The one server route,
`src/app/api/visitor-comments`, turns each comment into a pull request on this repo that adds
`content/visitor-comments/<slug>/<id>.json`; merging it publishes the comment as a "From visitors" card on the next
deploy, closing it discards it. It needs two Vercel environment variables:

- `SOUNDSCAPE_GITHUB_TOKEN`: a fine-grained GitHub token for this repo only, with Contents and Pull requests set to
  read and write.
- `SOUNDSCAPE_GITHUB_REPO`: the repo, as `owner/name`.

Without them the card says comments are closed. The pull requests are opened by the token's account; when that's your
own, GitHub only emails you about them with Settings → Notifications → "Include your own updates" turned on.
`vercel.json` turns off preview builds for the comment branches (`visitor/…`).

## Adding a song

Add `content/songs/<slug>.json` and its cover `content/covers/<slug>.jpg` (plus any film posters in
`content/posters/` and icons for new source sites in `content/icons/`), then push. Step by step: `ADD-A-SONG.md`. The
format and rules: `content/README.md`; the full schema: `src/content/schema.ts`.

## Running it locally

```
npm install
npm run dev            # http://localhost:3000
npm run content:check  # check the songs
npm run build          # the site, every page prerendered (needs network: it fetches the Chinese font)
npm start              # serve the build at http://localhost:3200
```

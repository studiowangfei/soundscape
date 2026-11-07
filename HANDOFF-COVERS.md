# Handoff: this build adds high-resolution covers

For the agent that puts `dist.zip` into the site's GitHub repo and adds songs. Read this once, before applying this
build. Afterwards `ADD-A-SONG.md` ("The cover") covers the same ground for every new song.

## What's new, in one paragraph

Covers used to be 800 px JPEGs, soft on large screens. Now each song keeps **one large original**,
`content/covers/<slug>.jpg` (JPEG, **1,200 to 2,048 px** on its longest side, at most **2 MB**), and the **build turns
it into two WebPs**: `<slug>-1200.webp`, which phones load, and `<slug>-2048.webp` for everything wider. The site never
serves the JPEG itself. A new command, **`npm run cover <slug>`**, finds and saves the original for you. The build
uses **sharp** (an image library) for the WebPs; it's now a listed dependency, so Vercel installs it like any other.

## 1. Applying this build

**It comes as two zips** (each under 25 MB): `dist-1-of-2.zip` (the site, the songs and the first half of the covers)
and `dist-2-of-2.zip` (the rest of the covers). Unzip both into the same place: both make the same `dist/` folder, and
the build needs both. Check that `content/covers/` then holds one `<slug>.jpg` for every `content/songs/<slug>.json`
(`npm run content:check` fails on a missing one).

Apply it the way you normally do (the rules in `HANDOFF-VISITOR-COMMENTS.md` still hold: keep
`content/visitor-comments/` untouched, don't drop repo-only songs without asking). Then:

1. **Covers in the zips replace the repo's.** Together their `content/covers/` has the new originals for all its songs.
2. **Songs only in the repo** (ones you added that aren't in the zip) still have 800 px covers, and the content check
   now refuses anything under 1,200 px, so **the build would fail**. For each of them, run `npm run cover <slug>` and
   look at the saved image (see section 3). If one finds nothing big enough, tell the owner before pushing.
3. **Keep the zip's `package-lock.json` as it is.** Don't regenerate it on a Mac: it carries sharp's Linux build, which
   Vercel needs.

Before pushing, check locally:

```
npm ci
npm run content:check   # "N entries OK"
npm run build           # early in the log: "made <2 × N> WebP covers (… MB) in public/covers"
```

Push as one commit, e.g. `Update site: high-resolution covers`.

## 2. Nothing to set on Vercel

No new environment variables or settings. If sharp ever fails to install or run there, the build stops with an error
(there's deliberately no fallback to unconverted covers): look at the build log, and make sure `package-lock.json`
is the zip's.

## 3. Adding a song's cover from now on

Write the entry first, with `cover.album` (the album whose cover it is), then:

```
npm run cover <slug>
```

It searches iTunes (art up to 3,000 px), the Cover Art Archive and Deezer for that album by the song's artist, saves
the largest match as `content/covers/<slug>.jpg` (scaled down to 2,048 px if bigger) and sets `cover.sourceUrl`.

**Then look at the image.** It must be the album's usual cover. Stores sometimes carry a remaster, deluxe edition or
single with different art, or a different tint.

- `npm run cover <slug> -- --list`: every candidate with its size; writes nothing.
- `npm run cover <slug> -- --url <image-url>`: save that image instead (wrong edition, or an artist photo).
- "no cover of at least 1200 px": nothing big enough under that album name. Try `--list`, or find an image by hand for
  `--url`. If none exists, tell the owner; never upscale a small image to get past the check.

Don't make WebPs, resize or recompress covers yourself: the build does it.

## 4. Exceptions

Two songs have no cover at 1,200 px anywhere, so the owner allowed them smaller, by name, in
`src/content/cover-rules.ts` (`SMALL_COVERS`): Ryuichi Sakamoto's "Once in a Lifetime" and David Lang & Sumi Jo's
"Simple Song #3". Don't add songs to that list yourself; ask the owner.

## 5. Checking it after deploy

- Open a song page on a desktop: in the browser's network panel the cover is `/covers/<slug>-2048.webp`.
- On a phone, `/covers/<slug>-1200.webp`.
- No request for `/covers/<slug>.jpg` anywhere (that would be a 404).

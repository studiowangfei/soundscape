# Handoff: this build adds visitor comments ("Your take")

For the agent that puts `dist.zip` into the site's GitHub repo and adds songs. Read this once, before applying this
build. Afterwards `ADD-A-SONG.md` (rules for every push) and `README.md` (setup) cover the same ground; this file
explains the change.

## What's new, in one paragraph

Every song page now ends with a **"Your take"** card where any visitor can leave a comment and, optionally, a name.
Each submission becomes a **pull request on this repo** that adds one file under `content/visitor-comments/`. The
site's owner reads it on GitHub and **merges it to publish** (Vercel redeploys and the comment appears as a
**"Visitor comment"** card on that song's page) or **closes it to discard** it. Nothing a visitor writes is on the site
until the owner merges it. To make this work, the site is **no longer a static export**: every page is still
prerendered, but one server route, `src/app/api/visitor-comments`, runs on Vercel.

## 1. Applying this dist.zip

This is the first package with the new folder rule. Apply it the way you normally do, with these two exceptions:

1. **Keep `content/visitor-comments/` exactly as it is in the repo.** The zip never contains it; the folder only
   exists in the repo (and may not exist yet: that's fine). Never delete, replace or empty it.
2. **Don't silently drop songs that are in the repo but not in the zip.** If the repo has `content/songs/*.json`
   (with their covers, posters, icons) that the zip doesn't, list them to the owner and ask before removing any.

Everything else (`src/`, configs, `package.json`, `package-lock.json`, `scripts/`, the docs at the top) is replaced
by the zip's version. New files in this package: `vercel.json`, this handoff, and visitor-comment code under
`src/visitors/`, `src/content/visitors.ts`, `src/app/api/visitor-comments/`, `src/components/cards/`.

Before pushing, check locally:

```
npm ci
npm run content:check   # "N entries OK" then "M visitor comments OK"
npm run build
```

The build's route table must show every `/songs/…` page as **● (SSG)** and **`ƒ /api/visitor-comments`** as the
only dynamic route. Push as one commit, e.g. `Update site: visitor comments ("Your take" card)`.

## 2. Vercel and GitHub settings (the owner does these; check and remind)

The endpoint needs two **environment variables** in the Vercel project (Production; Preview too if they want it
there). Without them the card still shows, but sending says "Comments are closed for now."

| Variable | Value |
|---|---|
| `SOUNDSCAPE_GITHUB_TOKEN` | a **fine-grained GitHub token**, this repo only, with **Contents: read and write** and **Pull requests: read and write** |
| `SOUNDSCAPE_GITHUB_REPO` | this repo as `owner/name` |

Changing an environment variable needs a redeploy to take effect.

Also:

- **Vercel project settings:** framework preset Next.js, **no Output Directory override**. If an earlier static setup
  set the output directory to `out`, clear it: there is no `out/` any more.
- **Notifications:** the pull requests are opened by the token's account. When that's the owner's own account,
  GitHub only emails them about it with **Settings → Notifications → "Include your own updates"** turned on (no
  mobile push for your own activity).
- **`vercel.json`** turns off preview builds for the comment branches (`visitor/**`), so each comment doesn't trigger
  a deployment. After the first visitor pull request, confirm no preview deployment ran for it.
- The label `visitor-comment` is added to each comment's pull request. If GitHub doesn't create it on first use,
  create it once (any colour).

## 3. What the cards look like (don't change `src/`)

The song page's card row is now: **the song's own cards** (unchanged) → **"Visitor comment" cards**, newest first →
**the "Your take" card**, always last.

- **"Your take", collapsed:** label `YOUR TAKE`; headline *Say something about this song* in italics, centred up and
  down in the card.
- **"Your take", opened:** the same label and italic headline, then a text box **"Write anything"**, a line
  **"Name (optional)"**, the note "Comments appear once reviewed." and a **Send** button. After sending: "Thanks.
  It'll show up here once it's approved." A half-written comment is kept if the card is closed or the page reloaded.
- **"Visitor comment", collapsed:** label `VISITOR COMMENT`, the comment in quotes (cut like a "People say" card), and
  at the foot, as other cards name their source, Soundscape's mark (the favicon's S) and `Soundscape · name` (or
  "Anonymous").
- **"Visitor comment", opened:** the full comment, then Soundscape's mark and `Soundscape · name · date`.

Visitor cards are not entry cards: they aren't in `content/songs/*.json`, don't count toward the 9-card limit, and you
never write them by hand.

## 4. The comment files

`content/visitor-comments/<slug>/<id>.json`, one per approved comment, written by the site, never by you:

```json
{ "id": "20261104-k3x9q2", "song": "oasis-live-forever", "text": "Plays every winter.", "name": null, "date": "2026-11-04" }
```

`id` is `YYYYMMDD-` plus six base-36 characters and names the file; `song` names its folder; `text` is 1–600
characters; `name` is up to 40 characters or `null` ("Anonymous"). No email or anything else about the visitor is
ever stored. `npm run content:check` checks them; **a bad or orphaned comment is only a warning** and the site leaves
it out, so it never blocks a deploy, but tell the owner if you see one.

## 5. Your part from now on

- **Pull requests from `visitor/…` branches are the owner's.** Don't merge, close, edit or comment on them. (They
  read like: title `From visitors · <Song>: "<start of the comment>"`, the comment in a code block, one file changed.)
- **Never touch `content/visitor-comments/`** unless the owner asks. To take one published comment down, delete its
  file in a commit of its own.
- **Taking a song down** now means: revert its commit **and** delete `content/visitor-comments/<slug>/` in the same
  commit.
- **Adding songs** is unchanged (`ADD-A-SONG.md`); a new song gets its "Your take" card automatically.

## 6. What the site does to keep spam out (so you can explain it)

- Text 1–600 characters, name up to 40; links (`http…`, `www.`) refused; an email address as the name refused ("Just
  a name, please: no email addresses."); a short list of slurs refused.
- A hidden field and a 3-second minimum catch simple bots (they get a fake "Thanks" and no pull request).
- At most 5 comments an hour per visitor and 30 an hour overall per server instance; new comments pause while 50 are
  waiting for approval ("Lots of comments right now. Try again later.").
- Only the site's own pages can post; the visitor's IP is used for counting in memory only, never stored or logged.
- The repo is public: anyone can read a waiting or closed comment's pull request. The owner has accepted this.

## 7. Checking it after deploy

Without sending anything:

- Open any song page: the row ends with the "Your take" card; opening it shows the form.
- Vercel's build log shows `ƒ /api/visitor-comments` and the songs as prerendered.

A real end-to-end test opens a real pull request on this public repo, so **only with the owner's go-ahead**: send a
comment from the live site, check the pull request arrived (and the owner's notification), then close it (or merge it
to see the "Visitor comment" card, and delete the file afterwards).

## 8. If something's wrong

| What a visitor sees | Likely cause | Fix |
|---|---|---|
| "Comments are closed for now." | the two environment variables aren't set (or no redeploy since) | set them in Vercel, redeploy |
| "Something went wrong. Try again in a moment." | the token is wrong, expired or lacks Contents / Pull requests write; or the repo name is wrong | check Vercel's function logs for `/api/visitor-comments`; make a new token |
| "Lots of comments right now. Try again later." | 50 comments waiting, or a burst from one place | the owner works through the waiting pull requests |
| A merged comment doesn't show | the deploy after the merge failed or hasn't finished, or the file was edited into an invalid one (content:check warns) | check the Vercel deployment and the warning |

Locally, `SOUNDSCAPE_VISITOR_DRY_RUN=1 npm run dev` makes sending succeed without calling GitHub, for trying the card.

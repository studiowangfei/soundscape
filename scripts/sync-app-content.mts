// Makes the iPhone app's content (src/content/app-export.ts) in public/app/v1/ (gitignored): index.json and one file per
// song, named by its contents, from the entries and approved visitor comments the site is built from. Run by
// `npm run build` and `npm run dev` (after sync-cjk-font, whose font files the index lists). A new set is made in a folder
// beside it and swapped in only once complete. With IOS_APP_ID set it also writes /.well-known/apple-app-site-association.
import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR, appIndex, appSiteAssociation, appSong, cjkFontFiles, contentHash, IOS_APP_ID, songFile } from "../src/content/app-export";
import { CJK_FONT_CSS, CJK_FONT_DIR, fontUrls } from "../src/content/cjk-font";
import { iconVersions } from "../src/content/icon-versions";
import { CONTENT_DIR, loadEntries } from "../src/content/load";
import { checkVisitorComments } from "../src/content/visitors";

const publicDir = path.resolve(process.cwd(), "public");
const out = path.join(publicDir, APP_DIR);
const next = `${out}.next`;

const entries = await loadEntries();
// A broken comment file is left out with a warning, as the song pages do (content/visitors.ts loadVisitorComments).
const visitors = await checkVisitorComments(CONTENT_DIR, new Set(entries.map((e) => e.slug)));
for (const e of visitors.errors) console.warn(`warning: visitor comment ${e.file} left out of the app: ${e.message}`);

await fs.rm(next, { recursive: true, force: true });
await fs.mkdir(path.join(next, "songs"), { recursive: true });
const hashes = new Map<string, string>();
let comments = 0;
for (const entry of entries) {
  const own = visitors.bySong.get(entry.slug) ?? [];
  comments += own.length;
  const json = JSON.stringify(appSong(entry, own, await iconVersions(entry.cards)));
  const hash = contentHash(json);
  hashes.set(entry.slug, hash);
  await fs.writeFile(path.join(next, songFile(entry.slug, hash)), json);
}
const css = await fs.readFile(path.join(publicDir, CJK_FONT_DIR, CJK_FONT_CSS), "utf8").catch(() => "");
const index = appIndex(entries, hashes, cjkFontFiles(css, fontUrls(css)));
await fs.writeFile(path.join(next, "index.json"), JSON.stringify(index));
await fs.rm(out, { recursive: true, force: true });
await fs.rename(next, out);

const association = path.join(publicDir, ".well-known", "apple-app-site-association");
if (IOS_APP_ID) {
  await fs.mkdir(path.dirname(association), { recursive: true });
  await fs.writeFile(association, JSON.stringify(appSiteAssociation(IOS_APP_ID)));
} else {
  await fs.rm(association, { force: true });
}
console.log(`made the app's content: ${entries.length} songs, ${comments} visitor comment${comments === 1 ? "" : "s"}, ${index.cjkFont ? "the Chinese typeface" : "no Chinese typeface"} in public/${APP_DIR} (${index.content})`);

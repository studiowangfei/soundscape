import fs from "node:fs/promises";
import path from "node:path";
import { missingIcons } from "../src/content/icons";
import { checkEntries, CONTENT_DIR } from "../src/content/load";
import { checkVisitorComments } from "../src/content/visitors";

const { entries, errors } = await checkEntries();
if (errors.length) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  console.error(`${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`${entries.length} entries OK`);

// Every site the cards cite needs its icon and its mark (a missing one is just hidden on the site, so only a warning).
const icons = new Set(await fs.readdir(path.join(CONTENT_DIR, "icons")).catch(() => [] as string[]));
for (const m of missingIcons(entries, icons))
  console.warn(`warning: no icon for ${m.domain} (missing content/icons/${m.files.join(", ")}; cited by ${m.songs.join(", ")}): run npm run icons`);

// Approved visitor comments (content/visitor-comments/<song>/), checked against the songs. A bad one is only a
// warning: the site leaves it out (loadVisitorComments) rather than failing every deploy over it.
const visitors = await checkVisitorComments(CONTENT_DIR, new Set(entries.map((e) => e.slug)));
for (const e of visitors.errors) console.warn(`warning: ${e.file}: ${e.message} (left out of the site)`);
const comments = [...visitors.bySong.values()].reduce((n, c) => n + c.length, 0);
console.log(`${comments} visitor comments OK${visitors.errors.length ? `, ${visitors.errors.length} left out` : ""}`);

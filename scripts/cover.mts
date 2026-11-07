// npm run cover <slug>: finds the largest version of a song's album cover (cover.album, by its artist) and saves it as
// the song's original, content/covers/<slug>.jpg (1,200–2,048 px, JPEG quality 90; src/content/cover-original.ts), then
// sets the entry's cover.sourceUrl. The build makes the WebPs the site serves (scripts/sync-covers.mts).
//
//   npm run cover <slug>                  pick and save
//   npm run cover <slug> -- --list        print every candidate with its size; write nothing
//   npm run cover <slug> -- --url <image> use that image instead of searching (still at least 1,200 px)
//   npm run cover <slug> -- --out <dir>   write <dir>/<slug>.jpg and <dir>/<slug>.json (what was chosen) instead of
//                                         the content folder; the entry isn't touched
//
// The pick: the edition the entry already points at when it reaches 2,048 px, else the largest candidate of at least
// 1,200 px. Under 1,200 px everywhere, it stops and says so: pick an image by hand with --url, or the song waits. (The
// few songs named in SMALL_COVERS, src/content/cover-rules.ts, may be smaller.)
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { minCoverPx } from "../src/content/cover-rules";
import { writeOriginal } from "../src/content/cover-original";
import { canonicalCoverUrl, chooseCover, findCandidates, type Candidate } from "../src/content/cover-search";
import { CONTENT_DIR } from "../src/content/load";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { list: { type: "boolean" }, url: { type: "string" }, out: { type: "string" } },
});
const slug = positionals[0];
// `npm run cover <slug> --list` (no `--`) hands --list to npm, not to this script, which would then save a cover.
const swallowed = ["list", "url", "out"].filter((f) => process.env[`npm_config_${f}`] !== undefined);
if (swallowed.length) {
  console.error(`npm took --${swallowed.join(", --")} for itself: put -- before the options, e.g. npm run cover ${slug ?? "<slug>"} -- --${swallowed[0]}${swallowed[0] === "list" ? "" : " …"}`);
  process.exit(2);
}
if (!slug) {
  console.error("usage: npm run cover <slug> [-- --list | --url <image-url> | --out <dir>]");
  process.exit(2);
}

const entryPath = path.join(CONTENT_DIR, "songs", `${slug}.json`);
const entry = JSON.parse(await fs.readFile(entryPath, "utf8").catch(() => fail(`no entry content/songs/${slug}.json`)));
const { album, sourceUrl } = entry.cover as { album?: string; sourceUrl?: string };
if (!values.url && entry.cover.kind !== "album") fail("this song's cover is an artist photo: pass --url <image-url>");
if (!values.url && !album) fail("the entry has no cover.album to search for: pass --url <image-url>");

type Measured = (Candidate | { source: "manual"; url: string; pinned?: boolean }) & { width: number; height: number; data: Buffer; finalUrl: string };

/** Downloads an image and measures it; null (with a note) when it can't be had. */
async function measure(c: Candidate | { source: "manual"; url: string }): Promise<Measured | null> {
  try {
    const res = await fetch(c.url, { headers: { "user-agent": "Soundscape/0.1 (cover lookup)" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const { width = 0, height = 0 } = await sharp(data).metadata();
    return { ...c, width, height, data, finalUrl: res.url || c.url };
  } catch (e) {
    console.warn(`  ${c.source}: couldn't load ${c.url} (${(e as Error).message})`);
    return null;
  }
}

const longest = (m: Measured) => Math.max(m.width, m.height);
let measured: Measured[];
if (values.url) {
  measured = [await measure({ source: "manual", url: values.url })].filter((m): m is Measured => !!m);
} else {
  const { candidates, failed } = await findCandidates({ album: album!, artist: entry.artist, sourceUrl });
  for (const f of failed) console.warn(`  ${f}: search failed or timed out`);
  measured = (await Promise.all(candidates.map(measure))).filter((m): m is Measured => !!m);
}

if (values.list) {
  for (const m of [...measured].sort((a, b) => longest(b) - longest(a)))
    console.log(`${String(m.width).padStart(5)}×${String(m.height).padEnd(5)} ${m.source.padEnd(7)}${m.pinned ? " (current edition)" : ""} ${"album" in m ? `"${m.album}" ` : ""}${m.url}`);
  if (!measured.length) console.log("no candidates");
  process.exit(0);
}

const minPx = minCoverPx(slug);
const { pick, replaced } = chooseCover(measured, minPx);
if (!pick) {
  const best = measured.length ? `largest found: ${Math.max(...measured.map(longest))} px` : "nothing found";
  fail(`no cover of at least ${minPx} px for "${album ?? values.url}" (${best}). Pick one by hand: npm run cover ${slug} -- --url <image-url>`);
}

const outDir = values.out ? path.resolve(values.out) : path.join(CONTENT_DIR, "covers");
await fs.mkdir(outDir, { recursive: true });
const saved = await writeOriginal(pick.data, path.join(outDir, `${slug}.jpg`), minPx).catch((e: Error) => fail(e.message));
const url = canonicalCoverUrl(pick.url, pick.finalUrl);
const chosen = { source: pick.source, url, found: [pick.width, pick.height], ...saved };
if (values.out) {
  await fs.writeFile(path.join(outDir, `${slug}.json`), `${JSON.stringify(chosen, null, 2)}\n`);
} else {
  entry.cover.sourceUrl = url;
  await fs.writeFile(entryPath, `${JSON.stringify(entry, null, 2)}\n`);
}
console.log(`${slug}: ${pick.source}${pick.pinned ? " (current edition)" : ""}, ${pick.width}×${pick.height} → ${saved.width}×${saved.height}, ${(saved.bytes / 1024).toFixed(0)} KB`);
console.log(`  ${url}`);
if (replaced)
  console.warn(`  note: this replaces the current edition (${replaced.width}×${replaced.height}) with ${pick.source}${"album" in pick ? ` "${pick.album}"` : ""}: check the art is the same`);

function fail(message: string): never {
  console.error(`${slug}: ${message}`);
  process.exit(1);
}

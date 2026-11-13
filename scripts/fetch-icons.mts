// Saves the icon of every site the cards cite (the logo beside each card's attribution line) to
// content/icons/<domain>.png, from Google's favicon service, plus any domains named. Skips icons already saved unless
// --force. Then make their one-colour marks with mono-icons.mts (both: npm run icons).
// Run: npx tsx scripts/fetch-icons.mts [--force] [domain ...] (in this workspace, from web/ with NODE_USE_ENV_PROXY=1)
import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "../src/content/load";

const { sourceSite } = await import("../src/components/cards/sources");

const force = process.argv.includes("--force");
const songsDir = path.join(CONTENT_DIR, "songs");
const iconsDir = path.join(CONTENT_DIR, "icons");
await fs.mkdir(iconsDir, { recursive: true });

const domains = new Set<string>(process.argv.slice(2).filter((a) => !a.startsWith("--")));
for (const f of (await fs.readdir(songsDir)).filter((f) => f.endsWith(".json"))) {
  for (const card of JSON.parse(await fs.readFile(path.join(songsDir, f), "utf8")).cards) domains.add(sourceSite(card).domain);
}
for (const domain of [...domains].sort()) {
  const file = path.join(iconsDir, `${domain}.png`);
  if (!force && (await fs.stat(file).catch(() => null))) continue;
  const res = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    console.warn(`none ${domain} (${res.status})`);
    continue;
  }
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok ${domain}`);
}

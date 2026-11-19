import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sourceSite } from "../components/cards/sources";
import { CONTENT_DIR } from "./load";
import type { EntryCard } from "./schema";

/**
 * A short fingerprint of each icon the cards' sites use (content/icons/<domain>.png and .mono.png), by domain, read when
 * the page is built. The icons' addresses carry it (iconUrl), because browsers keep icons for a day (next.config.ts): a
 * replaced icon gets a new address, so every browser fetches it at once instead of showing the copy it saved (Safari
 * kept YouTube's old, cropped one even through a reload). Unchanged files keep their fingerprint, so saved copies still
 * serve. A site with neither file has none (its icon is hidden anyway).
 */
export async function iconVersions(cards: EntryCard[], dir: string = path.join(CONTENT_DIR, "icons")): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const domain of new Set(cards.map((c) => sourceSite(c).domain))) {
    if (!domain) continue;
    const hash = createHash("sha1");
    let found = false;
    for (const file of [`${domain}.png`, `${domain}.mono.png`]) {
      const bytes = await fs.readFile(path.join(dir, file)).catch(() => null);
      hash.update(`${file}:`);
      if (bytes) {
        hash.update(bytes);
        found = true;
      }
    }
    if (found) versions[domain] = hash.digest("hex").slice(0, 8);
  }
  return versions;
}

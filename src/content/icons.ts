import { sourceSite } from "../components/cards/sources";
import type { EntryCard } from "./schema";

/**
 * The sites cards cite that lack their icon (content/icons/<domain>.png, shown beside an opened card's source) or their
 * one-colour mark (<domain>.mono.png, on the collapsed card): each with the files it's missing and the songs citing it,
 * in the order first cited. `have`: the file names in content/icons. A missing icon is simply hidden on the site, so
 * nothing else flags it (scripts/fetch-icons.mts and mono-icons.mts make them: npm run icons).
 */
export function missingIcons(entries: { slug: string; cards: EntryCard[] }[], have: Set<string>): { domain: string; files: string[]; songs: string[] }[] {
  const out = new Map<string, { domain: string; files: string[]; songs: string[] }>();
  for (const { slug, cards } of entries) {
    for (const card of cards) {
      const { domain } = sourceSite(card);
      if (!domain) continue;
      const files = [`${domain}.png`, `${domain}.mono.png`].filter((f) => !have.has(f));
      if (!files.length) continue;
      const site = out.get(domain) ?? { domain, files, songs: [] };
      if (!site.songs.includes(slug)) site.songs.push(slug);
      out.set(domain, site);
    }
  }
  return [...out.values()];
}

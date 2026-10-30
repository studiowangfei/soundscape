import type { EntryCard } from "@/content/schema";
import { formatDate } from "./meta";

/** Display names for the sites cards cite (the domain is the icon: public/icons/<domain>.png, from content/icons/). */
const NAMES: Record<string, string> = {
  "youtube.com": "YouTube",
  "wikipedia.org": "Wikipedia",
  "pitchfork.com": "Pitchfork",
  "rollingstone.com": "Rolling Stone",
  "nme.com": "NME",
  "thefader.com": "The Fader",
  "billboard.com": "Billboard",
  "genius.com": "Genius",
  "newyorker.com": "The New Yorker",
  "npr.org": "NPR",
  "elle.com": "Elle",
  "xxlmag.com": "XXL",
  "pastemagazine.com": "Paste",
  "variety.com": "Variety",
  "gq-magazine.co.uk": "GQ",
  "clashmusic.com": "Clash",
  "theguardian.com": "The Guardian",
  "letterboxd.com": "Letterboxd",
  "douban.com": "Douban",
};

/**
 * Icons whose logo doesn't fill its disc: a wide or transparent-edged mark that the round crop would cut (YouTube's
 * play button), so it's shown whole, inset in the white disc. Solid tiles and round logos fill theirs.
 */
const INSET = new Set(["youtube.com"]);

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    // An archived page counts as the site it archived.
    const archived = u.hostname === "web.archive.org" && u.pathname.match(/^\/web\/[^/]+\/(https?:\/\/.+)$/);
    return archived ? hostOf(archived[1]) : u.hostname.replace(/^(www|m)\./, "");
  } catch {
    return "";
  }
}

/** The site a card comes from: the domain its icon is filed under, its clean name, and whether its logo is inset. */
export function sourceSite(card: EntryCard): { domain: string; name: string; inset: boolean } {
  const host = hostOf(card.url);
  const domain = host.endsWith("wikipedia.org") ? "wikipedia.org" : host === "youtu.be" || host.endsWith("youtube.com") ? "youtube.com" : host.endsWith("douban.com") ? "douban.com" : host;
  return { domain, name: NAMES[domain] ?? card.source.name.split(" — ")[0], inset: INSET.has(domain) };
}

/**
 * A card's attribution line, as the design writes it: "Pitchfork", "YouTube · @author", "YouTube · channel"; the
 * expanded card adds the date (or likes, or views).
 */
export function attribution(card: EntryCard, expanded = false): { domain: string; inset: boolean; text: string } {
  const { domain, name, inset } = sourceSite(card);
  const channel = card.source.name.split(" — ")[1];
  const parts =
    card.type === "comment"
      ? [name, card.comment?.author, expanded && card.comment?.likesObserved != null ? `${card.comment.likesObserved.toLocaleString("en-US")} likes` : null]
      : card.type === "version"
        ? [name, channel, expanded ? card.version?.popularityObserved : null]
        : [name, expanded ? formatDate(card.sourceDate) : null];
  return { domain, inset, text: parts.filter(Boolean).join(" · ") };
}

import type { EntryCard } from "@/content/schema";
import { attribution } from "./sources";

/**
 * The source line at the foot of a card: the site's icon (public/icons/<domain>.png, on a white disc so dark logos
 * show on the glass) and "Site · author". The
 * expanded card's is larger, adds the date (or likes, or views), and links to the source.
 */
export function Attribution({ card, expanded = false }: { card: EntryCard; expanded?: boolean }) {
  const { domain, inset, text } = attribution(card, expanded);
  // An inset logo sits whole in the middle of the disc (2px of room at 16px, 3.5px at 24px); the rest fill it.
  const fit = inset ? `object-contain ${expanded ? "p-[3.5px]" : "p-[2px]"}` : "object-cover";
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin icon */}
      <img
        src={`/icons/${domain}.png`}
        alt=""
        className={`shrink-0 rounded-full bg-white ${fit} ${expanded ? "size-6" : "size-4"}`}
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
      <span className="truncate">{text}</span>
    </>
  );
  return expanded ? (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 text-[16px] text-[#888] transition-colors hover:text-white/80">
      {body}
    </a>
  ) : (
    <p className="flex min-w-0 items-center gap-2 text-[12px] text-white/55">{body}</p>
  );
}

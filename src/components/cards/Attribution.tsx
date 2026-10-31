import type { EntryCard } from "@/content/schema";
import { attribution } from "./sources";

/**
 * The source line at the foot of a card: the site's mark and "Site · author". The collapsed card draws the mark in the
 * text's grey, like the player's streaming icons (content/icons/<domain>.mono.png, from generator/scripts/mono-icons.mts).
 * The expanded card's is larger: the site's colour icon on a white disc, so dark logos show on the glass; it adds
 * the date (or likes, or views) and links to the source.
 */
export function Attribution({ card, expanded = false }: { card: EntryCard; expanded?: boolean }) {
  const { domain, inset, text } = attribution(card, expanded);
  const mono = `url(/icons/${domain}.mono.png) center / contain no-repeat`;
  const icon = expanded ? (
    // eslint-disable-next-line @next/next/no-img-element -- static same-origin icon
    <img
      src={`/icons/${domain}.png`}
      alt=""
      // An inset logo sits whole in the middle of the disc, with 3.5px of room; the rest fill it.
      className={`size-6 shrink-0 rounded-full bg-white ${inset ? "object-contain p-[3.5px]" : "object-cover"}`}
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
    />
  ) : (
    // A site without a mark yet shows nothing here (a mask that doesn't load hides the box).
    <span aria-hidden className="size-4 shrink-0 bg-current" style={{ mask: mono, WebkitMask: mono }} />
  );
  const body = (
    <>
      {icon}
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

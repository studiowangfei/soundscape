import type { ReactNode } from "react";
import type { EntryCard } from "@/content/schema";
import type { VisitorComment } from "@/content/visitors";
import { SoundscapeMark } from "./SoundscapeMark";
import { attribution, visitorAttribution } from "./sources";

/**
 * The source line at the foot of a card: the site's mark and "Site · author". The collapsed card draws the mark in the
 * text's grey, like the player's streaming icons (content/icons/<domain>.mono.png, from scripts/mono-icons.mts).
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
  return <SourceLine icon={icon} text={text} expanded={expanded} href={expanded ? card.url : undefined} />;
}

/** A visitor's comment's source line: Soundscape's mark and "Soundscape · name", and the day once opened. */
export function VisitorAttribution({ comment, expanded = false }: { comment: VisitorComment; expanded?: boolean }) {
  return <SourceLine icon={<SoundscapeMark expanded={expanded} />} text={visitorAttribution(comment, expanded)} expanded={expanded} />;
}

/** How a source line is set: the mark, then the text; opened, larger, and a link to the source when there is one. */
function SourceLine({ icon, text, expanded, href }: { icon: ReactNode; text: string; expanded: boolean; href?: string }) {
  const body = (
    <>
      {icon}
      <span className="truncate">{text}</span>
    </>
  );
  if (!expanded) return <p className="flex min-w-0 items-center gap-2 text-[12px] text-white/55">{body}</p>;
  const line = "flex min-w-0 items-center gap-3 text-[16px] text-[#888]";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${line} transition-colors hover:text-white/80`}>
      {body}
    </a>
  ) : (
    <p className={line}>{body}</p>
  );
}

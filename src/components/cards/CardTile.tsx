"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { EntryCard } from "@/content/schema";
import { GlassEdge, useGlass } from "../glass/Glass";
import { Attribution } from "./Attribution";
import { startSeconds, TYPE_LABEL, youtubeId, ytThumb } from "./meta";
import { PosterStage } from "./PosterStage";

// The design's card type: an 8px capital label, Libre Baskerville headlines, SF body text. Secondary text is
// translucent white rather than the design's fixed greys: the same on dark glass, still legible on light glass.
export const LABEL = "text-[8px] leading-[8px] font-semibold tracking-[0.8px] text-white/55 uppercase";
const HEADLINE = "font-serif text-[18px] leading-[26px] text-white";

/**
 * A card's picture on the Content kind: the video (its thumbnail, id, and where to start: a long set is linked at the
 * moment the song plays), or the film's poster. Null when it has none.
 */
export function cardMedia(card: EntryCard): { video: string; id: string; start: number } | { poster: string; title: string } | null {
  const vid = card.type === "version" ? youtubeId(card.url) : null;
  if (vid) return { video: ytThumb(vid), id: vid, start: startSeconds(card.url) };
  if (card.type === "film" && card.film?.poster) return { poster: `/posters/${card.film.poster.file}`, title: card.film.title };
  return null;
}

/** The comment as the design quotes it: “ text ”. */
export const quoted = (s: string) => `“ ${s.trim()} ”`;

/**
 * What a 250×250 card shows, in one of the design's kinds: Background (headline and the start of the story), People
 * say (the comment), Lyric (the line), Content (a picture and a headline); the source line at the foot. Also drawn by
 * the open card while it grows out of the tile.
 */
export function TileFace({ card }: { card: EntryCard }) {
  // A lyric card: its label and source line where every card has them, the quoted line centred between.
  if (card.type === "lyric" && card.lyric)
    return (
      <>
        <p className={`absolute top-5 left-5 w-[210px] ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
        <div className="absolute inset-x-5 top-12 bottom-12 flex items-center justify-center">
          <p className={`line-clamp-5 text-center whitespace-pre-line ${HEADLINE}`}>{quoted(card.lyric.excerptOrTimestamp)}</p>
        </div>
        <div className="absolute bottom-5 left-5 w-[210px]">
          <Attribution card={card} />
        </div>
      </>
    );
  const media = cardMedia(card);
  return (
    <>
      {media ? (
        <>
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-3">
            {"video" in media ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, no optimization needed
              <img src={media.video} alt="" className="h-[130px] w-full object-cover" />
            ) : (
              <PosterStage src={media.poster} title={media.title} className="h-[130px] w-full" inset="inset-x-5 inset-y-2.5" />
            )}
            <h3 className={`line-clamp-2 w-[210px] ${HEADLINE}`}>{card.headline}</h3>
          </div>
          <p className={`absolute top-5 left-5 w-[210px] ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
        </>
      ) : (
        <div className="absolute inset-x-0 top-0 flex flex-col gap-4 px-5 pt-5">
          <p className={LABEL}>{TYPE_LABEL[card.type]}</p>
          {card.type === "comment" ? (
            <p className={`line-clamp-5 whitespace-pre-line ${HEADLINE}`}>{quoted(card.snippet)}</p>
          ) : (
            <HeadlineAndStory headline={card.headline} story={card.type === "film" ? (card.film?.association ?? card.snippet) : card.snippet} />
          )}
        </div>
      )}
      <div className="absolute bottom-5 left-5 w-[210px]">
        <Attribution card={card} />
      </div>
    </>
  );
}

/**
 * A headline and the start of its story, sharing five lines: the headline up to three, the story the rest (the design's
 * three and two). Short headlines leave the story more room, so no card ends with a gap above its source line.
 */
function HeadlineAndStory({ headline, story }: { headline: string; story: string }) {
  const title = useRef<HTMLHeadingElement>(null);
  const [lines, setLines] = useState(2);
  useLayoutEffect(() => {
    const el = title.current;
    if (!el) return;
    // The headline's lines, from its height (26px each), measured again if it reflows (a font arriving, Tune → Text).
    const fit = () => setLines(5 - Math.min(3, Math.max(1, Math.round(el.offsetHeight / 26))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <h3 ref={title} className={`line-clamp-3 ${HEADLINE}`}>
        {headline}
      </h3>
      <p className="line-clamp-2 text-[15px] leading-[20px] text-white/68" style={{ WebkitLineClamp: lines }}>
        {story}
      </p>
    </>
  );
}

/**
 * Where a tile rests when the row stops scrolling. On phones the cards between the first and the last come to rest in
 * the middle of the screen, the first against the left margin and the last against the right; elsewhere every card
 * rests against the left margin.
 */
const SNAP = { first: "snap-start", middle: "snap-start phone:snap-center", last: "snap-start phone:snap-end" } as const;
export type Snap = keyof typeof SNAP;

type Props = { card: EntryCard; index: number; snap?: Snap; hidden: boolean; onOpen: (tile: HTMLElement) => void };

/**
 * A glass card in the row. It rises into place on load, lifts on hover (CSS transitions, so smooth both ways) and,
 * clicked, hands its spot to the open card (CardDetail grows out of it) and hides until that card has shrunk back.
 */
export function CardTile({ card, index, snap = "first", hidden, onOpen }: Props) {
  const { attach, style, filter, look } = useGlass("card");
  return (
    <button
      ref={attach}
      onClick={(e) => onOpen(e.currentTarget)}
      style={{ ...style, "--rise-delay": `${index * 45}ms` } as CSSProperties}
      className={`glass glass-hover glass-rise relative block h-[250px] w-[250px] shrink-0 ${SNAP[snap]} overflow-hidden text-left select-none [-webkit-touch-callout:none] ${hidden ? "invisible" : ""}`}
      aria-label={`${TYPE_LABEL[card.type]}: ${card.type === "comment" ? card.snippet : card.type === "lyric" && card.lyric ? card.lyric.excerptOrTimestamp : card.headline}`}
    >
      {filter}
      <TileFace card={card} />
      <GlassEdge light={look.light} />
    </button>
  );
}

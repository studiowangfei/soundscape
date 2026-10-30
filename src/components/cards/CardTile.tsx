"use client";

import type { CSSProperties } from "react";
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
 * What a 250×276 card shows, in one of the design's three kinds: Background (headline and the start of the story),
 * People say (the comment), Content (a picture and a headline); the source line at the foot. Also drawn by the open
 * card while it grows out of the tile.
 */
export function TileFace({ card }: { card: EntryCard }) {
  // A lyric card's tile is the lyric and nothing else: no label, no headline, no source line.
  if (card.type === "lyric" && card.lyric) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <p className={`whitespace-pre-line text-center ${HEADLINE}`}>{quoted(card.lyric.excerptOrTimestamp)}</p>
      </div>
    );
  }
  const media = cardMedia(card);
  return (
    <>
      {media ? (
        <>
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-4">
            {"video" in media ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, no optimization needed
              <img src={media.video} alt="" className="h-[130px] w-full object-cover" />
            ) : (
              <PosterStage src={media.poster} title={media.title} className="h-[130px] w-full" inset="inset-x-5 inset-y-2.5" />
            )}
            <h3 className={`line-clamp-3 w-[210px] ${HEADLINE}`}>{card.headline}</h3>
          </div>
          <p className={`absolute top-5 left-5 w-[210px] ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
        </>
      ) : (
        <div className="absolute inset-x-0 top-0 flex flex-col gap-4 px-5 pt-5">
          <p className={LABEL}>{TYPE_LABEL[card.type]}</p>
          {card.type === "comment" ? (
            <p className={`line-clamp-6 whitespace-pre-line ${HEADLINE}`}>{quoted(card.snippet)}</p>
          ) : (
            <>
              <h3 className={`line-clamp-3 ${HEADLINE}`}>{card.headline}</h3>
              <p className="line-clamp-4 text-[15px] leading-[20px] text-white/68">{card.type === "film" ? (card.film?.association ?? card.snippet) : card.snippet}</p>
            </>
          )}
        </div>
      )}
      <div className="absolute bottom-5 left-5 w-[210px]">
        <Attribution card={card} />
      </div>
    </>
  );
}

type Props = { card: EntryCard; index: number; hidden: boolean; onOpen: (tile: HTMLElement) => void };

/**
 * A glass card in the row. It rises into place on load, lifts on hover (CSS transitions, so smooth both ways) and,
 * clicked, hands its spot to the open card (CardDetail grows out of it) and hides until that card has shrunk back.
 */
export function CardTile({ card, index, hidden, onOpen }: Props) {
  const { attach, style, filter, look } = useGlass("card");
  return (
    <button
      ref={attach}
      onClick={(e) => onOpen(e.currentTarget)}
      style={{ ...style, "--rise-delay": `${index * 45}ms` } as CSSProperties}
      className={`glass glass-hover glass-rise relative block h-[276px] w-[250px] shrink-0 snap-start overflow-hidden text-left ${hidden ? "invisible" : ""}`}
      aria-label={`${TYPE_LABEL[card.type]}: ${card.type === "comment" ? card.snippet : card.type === "lyric" ? (card.lyric?.excerptOrTimestamp ?? card.headline) : card.headline}`}
    >
      {filter}
      <TileFace card={card} />
      <GlassEdge light={look.light} />
    </button>
  );
}

"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { EntryCard } from "@/content/schema";
import { GlassEdge, useGlass } from "../glass/Glass";
import { Attribution } from "./Attribution";
import { startSeconds, TYPE_LABEL, youtubeId, ytThumb } from "./meta";
import { PosterStage } from "./PosterStage";
import { isEntryCard, rowCardLabel, type RowCard } from "./row";
import { quoted, TILE_HEADLINE as HEADLINE, TILE_LABEL as LABEL } from "./styles";
import { EndTileFace, VisitorTileFace } from "./VisitorFaces";


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

/**
 * A quoted line, “ text ”, cut at a word to the lines its box allows (its max-height), the closing mark kept after
 * the cut (and any comma before it dropped): “ … a house… ”. Fitted again when the box changes size (phone ↔ wider, a rotation) and once fonts load.
 */
function FitQuote({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = text.trim().split(/(\s+)/); // the spaces and line breaks kept, to put back as they were
    const fits = (n: number) => {
      el.textContent = n === words.length ? quoted(text) : quoted(`${words.slice(0, n).join("").replace(/[\s,;:–—-]+$/, "")}…`);
      return el.scrollHeight <= el.clientHeight + 1;
    };
    // The most words that fit, by halving (the text is set on the element directly: it's only ever this text).
    const fit = () => {
      if (fits(words.length)) return;
      let [lo, hi] = [0, words.length - 1];
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (fits(mid)) lo = mid;
        else hi = mid - 1;
      }
      fits(lo);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [text]);
  return (
    <p ref={ref} className={className}>
      {quoted(text)}
    </p>
  );
}

/**
 * What a 250×250 card shows, in one of the design's kinds: Background (headline and the start of the story), People
 * say (the comment), Lyric (the line), Content (a picture and a headline); the source line at the foot. Also drawn by
 * the open card while it grows out of the tile. `short`: on phones, the Figma's short card (250×182): no story, no
 * content headline, the comment and the lyric three lines at most, the lyric starting under the label.
 */
export function TileFace({ card, short = false }: { card: EntryCard; short?: boolean }) {
  // A lyric card: its label and source line where every card has them, the quoted line centred between (five lines at
  // most; on a short card, three, from under the label).
  if (card.type === "lyric" && card.lyric)
    return (
      <>
        <p className={`absolute top-5 left-5 w-[210px] ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
        <div className={`absolute inset-x-5 top-12 bottom-12 flex items-center justify-center ${short ? "phone:top-11 phone:bottom-auto" : ""}`}>
          <FitQuote
            text={card.lyric.excerptOrTimestamp}
            className={`max-h-[130px] overflow-hidden text-center whitespace-pre-line ${HEADLINE} ${short ? "phone:max-h-[78px]" : ""}`}
          />
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
            <h3 className={`line-clamp-2 w-[210px] ${HEADLINE} ${short ? "phone:hidden" : ""}`}>{card.headline}</h3>
          </div>
          <p className={`absolute top-5 left-5 w-[210px] ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
        </>
      ) : (
        <div className="absolute inset-x-0 top-0 flex flex-col gap-4 px-5 pt-5">
          <p className={LABEL}>{TYPE_LABEL[card.type]}</p>
          {card.type === "comment" ? (
            <p className={`line-clamp-5 whitespace-pre-line ${HEADLINE} ${short ? "phone:line-clamp-3" : ""}`}>{quoted(card.snippet)}</p>
          ) : (
            <HeadlineAndStory headline={card.headline} story={card.type === "film" ? (card.film?.association ?? card.snippet) : card.snippet} short={short} />
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
function HeadlineAndStory({ headline, story, short }: { headline: string; story: string; short: boolean }) {
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
      <p className={`line-clamp-2 text-[15px] leading-[20px] text-white/68 ${short ? "phone:hidden" : ""}`} style={{ WebkitLineClamp: lines }}>
        {story}
      </p>
    </>
  );
}

/** Any card's tile face: the entry's own kinds (TileFace), a visitor's comment, or the end card. */
export function RowTileFace({ card, short = false }: { card: RowCard; short?: boolean }) {
  if (isEntryCard(card)) return <TileFace card={card} short={short} />;
  return card.type === "visitor" ? <VisitorTileFace comment={card.comment} short={short} /> : <EndTileFace />;
}

/**
 * Where a tile rests when the row stops scrolling. On phones the cards between the first and the last come to rest in
 * the middle of the screen, the first against the left margin and the last against the right; elsewhere every card
 * rests against the left margin.
 */
const SNAP = { first: "snap-start", middle: "snap-start phone:snap-center", last: "snap-start phone:snap-end" } as const;
export type Snap = keyof typeof SNAP;

type Props = { card: RowCard; index: number; delay?: number; snap?: Snap; short?: boolean; hidden: boolean; onOpen: (tile: HTMLElement) => void };

/**
 * A glass card in the row. It rises into place on load, lifts on hover (CSS transitions, so smooth both ways) and,
 * clicked, hands its spot to the open card (CardDetail grows out of it) and hides until that card has shrunk back.
 * `short`: on phones, the short variant (Tune → Cards), 182 tall.
 */
export function CardTile({ card, index, delay = 0, snap = "first", short = false, hidden, onOpen }: Props) {
  const { attach, style, filter, look } = useGlass("card");
  return (
    <button
      ref={attach}
      onClick={(e) => onOpen(e.currentTarget)}
      style={{ ...style, "--rise-delay": `${Math.round(delay) + index * 60}ms` } as CSSProperties}
      className={`glass glass-hover glass-rise relative block h-[250px] w-[250px] shrink-0 ${short ? "phone:h-[182px]" : ""} ${SNAP[snap]} overflow-hidden text-left select-none [-webkit-touch-callout:none] ${hidden ? "invisible" : ""}`}
      aria-label={rowCardLabel(card)}
    >
      {filter}
      <RowTileFace card={card} short={short} />
      <GlassEdge look={look} />
    </button>
  );
}

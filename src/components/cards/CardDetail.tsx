"use client";

import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { EntryCard } from "@/content/schema";
import { GlassEdge, useGlass, useGlassSettings } from "../glass/Glass";
import { glassLook } from "../glass/settings";
import { CardVideo } from "../player/CardVideo";
import { Attribution } from "./Attribution";
import { cardMedia, TileFace } from "./CardTile";
import { TYPE_LABEL } from "./meta";
import { flip, morphFrame, type Box, type Flip } from "./morph";
import { PosterStage } from "./PosterStage";

type Props = {
  card: EntryCard;
  /** Where the tile is now (it's measured again for the way back). */
  tile: () => Box;
  /** Called once the card has shrunk back into its tile. */
  onClosed: () => void;
};

// The expanded card's type, as the design sets it: a 12px capital label, a 25px headline, 18px body text, in its greys.
const LABEL = "text-[12px] leading-[14px] font-semibold tracking-[1.2px] text-[#888] uppercase";
const HEADLINE = "font-serif text-[25px] leading-[34px] text-white";
const BODY = "text-[18px] leading-[26px] text-[#bbb]";

/** How tall the design draws each kind of open card, at the least (a card with more to say grows). */
const minHeight = (card: EntryCard, media: boolean) => (media ? 598 : card.type === "lyric" ? 458 : card.type === "comment" ? 470 : 476);

const OPEN = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;
const CLOSE = { type: "spring", stiffness: 340, damping: 36, mass: 1 } as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The expanded card: 600 wide and at least as tall as the design draws its kind, centred above everything (a portal on <body>), the whole page
 * dimmed and blurred behind it; on phones held upright, a sheet along the foot of the screen (globals.css
 * .card-stage). It grows out of its tile and shrinks back into it (morph.ts): laid out in place, drawn over the tile,
 * and eased there, its glass one pane throughout (nothing cross-fades, so nothing flashes). The tile's face fades out
 * as the card's own content fades in. Closes on Escape, a click outside, the browser's Back (an open card is a step
 * in the history, so Android's back and iOS's swipe back close it rather than leave the song), or, by touch, dragging
 * it down from the top of its content. The page behind is out of reach meanwhile (inert).
 */
export function CardDetail({ card, tile, onClosed }: Props) {
  const glass = useGlass("expanded", { sync: true });
  const settings = useGlassSettings();
  const [revealed, setRevealed] = useState(false);
  const media = cardMedia(card);
  // Background, version and comment cards keep their context in the data but don't show it. A lyric card shows its
  // line, then the story behind it and how fans take it (its context, when there is one), run together as one
  // paragraph (its headline and album line stay in the data).
  const lyric = card.type === "lyric" ? card.lyric : undefined;
  const context = card.type === "background" || card.type === "version" || card.type === "comment" ? null : card.context;
  const parts = [card.type === "film" ? (card.film?.association ?? card.snippet) : card.type === "comment" ? null : card.snippet, context].filter(Boolean);
  const body = lyric && parts.length ? [parts.join(" ")] : parts;

  const pane = useRef<HTMLDivElement | null>(null);
  const face = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const video = useRef<{ pause(): void }>(null);
  const progress = useMotionValue(0);
  const dragY = useMotionValue(0); // how far a finger has pulled the card down (px)
  const flipRef = useRef<Flip | null>(null);
  const closing = useRef(false);

  // Draws progress p: the card's transform and corners, the two faces, the page behind, and the glass going from the
  // tile's look to the open card's.
  const draw = useCallback(
    (p: number) => {
      const f = flipRef.current;
      const el = pane.current;
      if (!f || !el) return;
      const m = morphFrame(p, f, glass.look.radius);
      // A pull-down rides on top, fading as the card goes back into its tile.
      const pull = dragY.get() * Math.min(1, Math.max(0, p));
      el.style.transform = `translate(${m.x}px, ${m.y + pull}px) scale(${m.sx}, ${m.sy})`;
      el.style.borderRadius = `${m.rx}px / ${m.ry}px`;
      if (face.current) {
        face.current.style.opacity = String(m.face);
        face.current.style.transform = `scale(${m.ix}, ${m.iy})`;
      }
      if (content.current) {
        content.current.style.opacity = String(m.content);
        content.current.style.transform = `scale(${m.cx}, ${m.cy})`;
      }
      if (overlay.current) overlay.current.style.opacity = String(m.overlay * (1 - Math.min(0.5, pull / 800)));
      // The bend scales with the card, its wide edge included, so drawn small it already matches the tile's; frost
      // doesn't, so it's set as seen on screen (the tile's at the start, the open card's at the end). In flight, over
      // the page's sharp text, the lens eases off, settling back in as the card lands: a lens racing over text reads
      // as a glitch.
      const from = glassLook("card", settings);
      const t = Math.min(1, Math.max(0, p));
      const flight = Math.sin(Math.PI * t);
      glass.live({
        frost: lerp(from.frost, glass.look.frost, t) / Math.sqrt(m.sx * m.sy),
        refraction: glass.look.refraction * (1 - 0.85 * flight),
        fill: lerp(from.fill, glass.look.fill, t),
      });
    },
    [glass, settings, dragY],
  );

  const measure = () => {
    const el = pane.current!;
    return flip(tile(), { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  };

  // Open: measure where the card ends up, draw it over the tile before the first paint, then ease it into place.
  useLayoutEffect(() => {
    if (!pane.current) return;
    flipRef.current = measure();
    draw(0);
    const unsubscribe = progress.on("change", draw);
    const controls = reducedMotion() ? (progress.set(1), null) : animate(progress, 1, OPEN);
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      unsubscribe();
      controls?.stop();
    };
    // Runs once, when the card opens; `draw` reads the latest settings through its own closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    if (closing.current || !pane.current) return;
    closing.current = true;
    video.current?.pause();
    flipRef.current = measure(); // the tile may have moved (a resize): aim at where it is now
    if (reducedMotion()) return onClosed();
    animate(progress, 0, { ...CLOSE, onComplete: onClosed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClosed, progress]);

  // The open card is a step in the history: Back closes it. Closing it any other way takes that step back too, and
  // the card goes when the history says so (popstate), so the two never disagree. (Pushed once, even when React runs
  // this twice in development.)
  useEffect(() => {
    if (history.state?.soundscapeCard !== card.id) history.pushState({ soundscapeCard: card.id }, "");
    const onPop = () => dismiss();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [card.id, dismiss]);
  const close = useCallback(() => {
    if (history.state?.soundscapeCard === card.id) history.back();
    else dismiss();
  }, [card.id, dismiss]);

  // The page behind is out of reach while the card is open: no tabbing to it, no screen reader wandering into it.
  useEffect(() => {
    const dialog = pane.current?.closest('[role="dialog"]');
    const behind = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== dialog && !el.inert);
    for (const el of behind) el.inert = true;
    return () => {
      for (const el of behind) el.inert = false;
    };
  }, []);

  // Touch: drag the card down to put it away, like a sheet. From the top of its content (scrolled right up), a
  // downward drag pulls the whole card; let go far or fast enough and it goes back into its tile, else it springs back.
  useEffect(() => {
    const el = pane.current;
    const scroller = content.current;
    if (!el || !scroller) return;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let samples: { t: number; y: number }[] = [];
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = !closing.current && e.touches.length === 1 && scroller.scrollTop <= 0 ? { x: t.clientX, y: t.clientY } : null;
      pulling = false;
      samples = [];
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (dy <= Math.abs(dx) || scroller.scrollTop > 0) {
          start = null; // scrolling the card, or sideways: not a pull
          return;
        }
        pulling = true;
        dragY.stop();
      }
      if (e.cancelable) e.preventDefault();
      dragY.set(Math.max(0, dy));
      samples.push({ t: e.timeStamp, y: dy });
      if (samples.length > 6) samples.shift();
    };
    const onEnd = () => {
      const was = pulling;
      start = null;
      pulling = false;
      if (!was) return;
      const [a, b] = [samples[0], samples[samples.length - 1]];
      const speed = a && b && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s, downward
      if (dragY.get() > 120 || speed > 700) close();
      else animate(dragY, 0, { type: "spring", stiffness: 500, damping: 40 });
    };
    const redraw = dragY.on("change", () => draw(progress.get()));
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      redraw();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [close, draw, dragY, progress]);

  useEffect(() => {
    // Escape while a video is full screen only leaves full screen (the browser's own), not the card too.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && close();
    window.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
    };
  }, [close]);

  const setPane = useCallback(
    (node: HTMLDivElement | null) => {
      pane.current = node;
      glass.attach(node);
    },
    [glass],
  );

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label={card.type === "comment" ? card.snippet : card.type === "lyric" && card.lyric ? card.lyric.excerptOrTimestamp : card.headline}>
      <div
        ref={overlay}
        className="absolute inset-0 touch-none"
        style={{ opacity: 0, backgroundColor: `rgba(0,0,0,${settings.dim})`, backdropFilter: `blur(${settings.blurBehind}px)`, WebkitBackdropFilter: `blur(${settings.blurBehind}px)` }}
        onClick={close}
      />
      <div className="card-stage pointer-events-none absolute inset-0 flex justify-center">
        <div ref={setPane} style={{ ...glass.style, transformOrigin: "0 0" }} className="glass-shadow pointer-events-auto relative w-full max-w-[600px] overflow-hidden">
          {glass.filter}
          {/* The glass is a layer under the content rather than the card itself: with an iframe (the video) inside an
              element whose backdrop runs through an SVG filter, Chrome filters that element's own content too, and the
              whole card went blurry. It reads the card's glass variables (set on the card, so the morph can drive them). */}
          <div aria-hidden className="glass absolute inset-0" style={{ borderRadius: "inherit" }} />

          {/* The open card's own content: it sets the card's size, and zooms up with the card (never stretched). */}
          <div
            ref={content}
            style={{ opacity: 0, transformOrigin: "0 0", "--card-min-h": `${minHeight(card, !!media)}px` } as CSSProperties}
            className="card-stage-content relative flex flex-col overflow-y-auto overscroll-contain">
            {/* On phones (a sheet): a grab handle says it can be pulled down. It stays at the top as the card scrolls. */}
            <div aria-hidden className="pointer-events-none sticky top-0 z-10 flex h-5 shrink-0 justify-center pt-2 sm:hidden">
              <span className="h-[5px] w-9 rounded-full bg-white/35" />
            </div>
            {/* For keyboard and screen-reader users; the design has no visible close control (click outside or Escape). */}
            <button
              ref={closeButton}
              onClick={close}
              className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:right-4 focus-visible:z-10 focus-visible:rounded-full focus-visible:bg-white/15 focus-visible:px-3 focus-visible:py-1 focus-visible:text-[13px] focus-visible:text-white"
            >
              Close
            </button>

            {media &&
              ("video" in media ? (
                // Played right here, with no label (nothing may sit over YouTube's player, and the video says what it is).
                <CardVideo ref={video} id={media.id} start={media.start} url={card.url} thumb={media.video} title={card.headline} />
              ) : (
                <div className="relative shrink-0">
                  <PosterStage src={media.poster} title={media.title} className="h-[300px] w-full" inset="inset-6" />
                  {/* On the Content kind the label sits on the picture, as on the card. */}
                  <p className={`pointer-events-none absolute top-8 left-8 ${LABEL}`}>{TYPE_LABEL[card.type]}</p>
                </div>
              ))}

            <div className={`flex flex-col gap-5 px-8 ${media && !("video" in media) ? "pt-6" : media ? "pt-3" : "pt-8"}`}>
              {!media && <p className={LABEL}>{TYPE_LABEL[card.type]}</p>}
              {card.type === "comment" ? (
                <Quote text={card.snippet} />
              ) : lyric ? (
                <LyricQuote text={lyric.excerptOrTimestamp} />
              ) : (
                <h2 className={HEADLINE}>{card.headline}</h2>
              )}
              {card.comment?.replies?.length ? <Replies replies={card.comment.replies} /> : null}
              {body.map((text, i) => (
                <p key={i} className={BODY}>
                  {text}
                </p>
              ))}
              {card.film?.plotDetails &&
                (revealed ? (
                  <p className={BODY}>{card.film.plotDetails}</p>
                ) : (
                  <button onClick={() => setRevealed(true)} className="self-start text-[16px] text-white/55 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white/75">
                    Reveal plot details (spoilers)
                  </button>
                ))}
            </div>

            <div className="mt-auto px-8 pt-8 pb-8">
              <Attribution card={card} expanded />
            </div>
          </div>

          {/* The tile's face, at the tile's size, while the card grows out of it. */}
          <div ref={face} aria-hidden style={{ transformOrigin: "0 0" }} className="pointer-events-none absolute top-0 left-0 h-[250px] w-[250px]">
            <TileFace card={card} />
          </div>

          <GlassEdge light={glass.look.light} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A quoted passage (a comment, a lyric line) as the design sets it. */
function Quote({ text }: { text: string }) {
  return (
    <blockquote className={HEADLINE}>
      {/* The opening mark is large, on a line of its own; the closing one stays with the last word. */}
      <span aria-hidden className="block h-8 text-[64px] leading-[normal]">
        “
      </span>
      <span className="mt-2 block whitespace-pre-line">
        {text.trim()}
        <span aria-hidden>{"\u00a0”"}</span>
      </span>
    </blockquote>
  );
}

/**
 * A lyric as the design sets it: the line centred, in bold, between two large marks on lines of their own, the opening
 * one at the left and the closing one at the right; 36px of air below it.
 */
function LyricQuote({ text }: { text: string }) {
  return (
    <blockquote className="mb-4 font-serif text-white">
      <span aria-hidden className="block h-8 text-[64px] leading-[normal]">
        “
      </span>
      <span className="block text-center text-[25px] leading-[34px] font-bold whitespace-pre-line">{text.trim()}</span>
      <span aria-hidden className="block h-8 text-right text-[64px] leading-[normal]">
        ”
      </span>
    </blockquote>
  );
}

type Reply = NonNullable<NonNullable<EntryCard["comment"]>["replies"]>[number];

/**
 * The comment's top replies, threaded as the design draws them: a 2px line drops from 9px under the comment and curves
 * into the middle of each reply's first line, 16px short of the text. Each reply draws its own curve, a screen tall and
 * clipped at the top of the list, so all of them start from the same point.
 */
function Replies({ replies }: { replies: Reply[] }) {
  return (
    <ul aria-label="Top replies" className="relative -mt-[11px] flex flex-col gap-8 overflow-hidden pt-[23px] pl-[49px]">
      {replies.map((r) => (
        <li key={r.commentId ?? r.text} className="relative">
          <span aria-hidden className="absolute bottom-[calc(100%_-_14px)] -left-[33px] h-screen w-[17px] rounded-bl-[17px] border-b-2 border-l-2 border-[#555]" />
          <p className={`whitespace-pre-line ${BODY}`}>“{r.text.trim()}”</p>
        </li>
      ))}
    </ul>
  );
}

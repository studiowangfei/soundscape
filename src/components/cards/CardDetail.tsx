"use client";

import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { EntryCard } from "@/content/schema";
import { GlassEdge, useGlass, useGlassSettings } from "../glass/Glass";
import { glassLook } from "../glass/settings";
import { CardVideo } from "../player/CardVideo";
import { Attribution, VisitorAttribution } from "./Attribution";
import { cardMedia, RowTileFace } from "./CardTile";
import { ROW_LABEL, TYPE_LABEL } from "./meta";
import { flip, morphFrame, type Box, type Flip } from "./morph";
import { PosterStage } from "./PosterStage";
import { isEntryCard, rowCardLabel, type RowCard } from "./row";
import { DETAIL_BODY as BODY, DETAIL_HEADLINE as HEADLINE, DETAIL_LABEL as LABEL } from "./styles";
import type { VisitorComment } from "@/content/visitors";
import { keyStaysInForm, startsInField } from "./form";
import { VisitorForm } from "./VisitorForm";
import { pagerFade, pagerStep } from "./switch";

type Props = {
  /** One of the entry's cards, a visitor's comment, or the end card (its form). */
  card: RowCard;
  /** Where the tile is now (it's measured again for the way back). */
  tile: () => Box;
  /** Called once the card has shrunk back into its tile. */
  onClosed: () => void;
  /** The tile is the short variant on phones (Tune → Cards). */
  short?: boolean;
  /** The cards either side in the row, if there are any, and how to move to one: swiping the card sideways (touch) or
   * the arrow keys move to them. */
  step?: { prev: boolean; next: boolean; go: (dir: -1 | 1, from?: number) => void };
  /** Arrived by a swipe from this side (1: from the right, -1: from the left): it slides in, rather than growing out of
   * its tile, and takes the last card's place in the history. */
  enter?: -1 | 0 | 1;
  /** How far along (px) the card it takes over from was when the two set off, so they keep a step apart. */
  from?: number;
  /** On its way out as the next card (that way: 1, the next) comes in beside it; then `onGone`. */
  leaving?: -1 | 1;
  onGone?: () => void;
};

/** How tall the design draws each kind of open card, at the least (a card with more to say grows). */
// (A visitor's comment and the end card are set as a comment card.)
const minHeight = (card: RowCard, media: boolean) =>
  media ? 598 : card.type === "lyric" ? 458 : card.type === "comment" || card.type === "visitor" || card.type === "end" ? 470 : 476;

const OPEN = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;
const CLOSE = { type: "spring", stiffness: 340, damping: 36, mass: 1 } as const;
// Moving to the next or previous card (switch.ts): the two cards along together, side by side, in one move; by touch,
// from wherever the finger let go.
const PAGER = { type: "tween", duration: 0.46, ease: [0.32, 0.72, 0, 1] } as const;
const SPRING_BACK = { type: "spring", stiffness: 500, damping: 40 } as const;
/** How far a sideways swipe must go (px), or how fast (px/s), to move to the next card. */
const SWIPE_DISTANCE = 80;
const SWIPE_SPEED = 500;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The page behind is out of reach while a card is open (two, for a moment, side by side): no tabbing to it, no screen
// reader wandering into it, no scrolling it. Held while any card is open, let go as the last one goes.
let holders = 0;
let held: { els: HTMLElement[]; overflow: string } | null = null;
function holdPage() {
  if (holders++ === 0) {
    const els = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute("data-card-dialog") && !el.inert);
    for (const el of els) el.inert = true;
    held = { els, overflow: document.documentElement.style.overflow };
    document.documentElement.style.overflow = "hidden";
  }
  return () => {
    if (--holders > 0 || !held) return;
    for (const el of held.els) el.inert = false;
    document.documentElement.style.overflow = held.overflow;
    held = null;
  };
}

/**
 * The expanded card: 600 wide and at least as tall as the design draws its kind, centred in the window above
 * everything (a portal on <body>), the whole page dimmed and blurred behind it; on phones, 8 px in from the sides
 * (globals.css .card-stage). It grows out of its tile and shrinks back into it (morph.ts): laid out in place, drawn
 * over the tile, and eased there, its glass one pane throughout (nothing cross-fades, so nothing flashes). The tile's
 * face fades out as the card's own content fades in. Swiped sideways (touch), or with the arrow keys, it moves on to the
 * next or previous card in the row, as Tune → Card switch says (the row scrolls to its tile, so closing goes back there). Closes
 * on Escape, a click outside, the browser's Back (an open card is a step in the history, so Android's back and iOS's
 * swipe back close it rather than leave the song), or, by touch, dragging it down from the top of its content. The page
 * behind is out of reach meanwhile (inert).
 */
export function CardDetail({ card, tile, onClosed, short = false, step, enter = 0, from = 0, leaving, onGone }: Props) {
  const glass = useGlass("expanded", { sync: true });
  const settings = useGlassSettings();
  const [revealed, setRevealed] = useState(false);
  const entry = isEntryCard(card) ? card : null;
  const media = entry && cardMedia(entry);
  // Background, version and comment cards keep their context in the data but don't show it. A lyric card shows its
  // line, then the story behind it and how fans take it (its context, when there is one), run together as one
  // paragraph (its headline and album line stay in the data).
  const lyric = entry?.type === "lyric" ? entry.lyric : undefined;
  const context = !entry || entry.type === "background" || entry.type === "version" || entry.type === "comment" ? null : entry.context;
  const parts = entry ? [entry.type === "film" ? (entry.film?.association ?? entry.snippet) : entry.type === "comment" ? null : entry.snippet, context].filter(Boolean) : [];
  const body = lyric && parts.length ? [parts.join(" ")] : parts;

  const pane = useRef<HTMLDivElement | null>(null);
  const face = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const video = useRef<{ pause(): void }>(null);
  const progress = useMotionValue(0);
  const dragY = useMotionValue(0); // how far a finger has pulled the card down (px)
  const dragX = useMotionValue(0); // how far the card is slid sideways: by a finger, or moving to the next card (px)
  // The card's opacity by how far along it is from the middle (moving to the next card, or dragged sideways).
  const fadeBy = useRef<((x: number) => number) | null>(null);
  const leavingRef = useRef(false);
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
      // A pull-down or a sideways slide rides on top, fading as the card goes back into its tile.
      const pull = dragY.get() * Math.min(1, Math.max(0, p));
      const slide = dragX.get() * Math.min(1, Math.max(0, p));
      el.style.transform = `translate(${m.x + slide}px, ${m.y + pull}px) scale(${m.sx}, ${m.sy})`;
      el.style.borderRadius = `${m.rx}px / ${m.ry}px`;
      const a = fadeBy.current ? fadeBy.current(dragX.get()) : 1;
      el.style.setProperty("--card-fade", String(a));
      if (face.current) {
        face.current.style.opacity = String(m.face);
        face.current.style.transform = `scale(${m.ix}, ${m.iy})`;
      }
      if (content.current) {
        content.current.style.opacity = String(m.content * a);
        content.current.style.transform = `scale(${m.cx}, ${m.cy})`;
      }
      // On its way out, the next card's dimming takes over.
      if (overlay.current) overlay.current.style.opacity = leavingRef.current ? "0" : String(m.overlay * (1 - Math.min(0.5, pull / 800)));
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
    [glass, settings, dragY, dragX],
  );

  const measure = () => {
    const el = pane.current!;
    return flip(tile(), { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  };

  // Open: measure where the card ends up, draw it over the tile before the first paint, then ease it into place. Or,
  // arriving from the card beside it, already open, off the side it comes from, sliding in.
  useLayoutEffect(() => {
    if (!pane.current) return;
    flipRef.current = measure();
    const unsubscribe = progress.on("change", draw);
    const unslide = dragX.on("change", () => draw(progress.get()));
    let controls: { stop(): void } | null = null;
    const el = pane.current;
    // A card fades by how far it is from the middle, a finger's drag included.
    const s = pagerStep(el.offsetWidth);
    fadeBy.current = (x) => pagerFade(x, s);
    if (enter) {
      progress.set(1);
      if (!reducedMotion()) {
        dragX.set(from + enter * s);
        controls = animate(dragX, 0, PAGER);
      }
      draw(1);
    } else {
      draw(0);
      if (reducedMotion()) progress.set(1);
      else controls = animate(progress, 1, OPEN);
    }
    // Focus goes into the card itself (no outline), not onto its Close button: focused there, the browser shows Close
    // whenever a key was the last thing pressed (opening a card with Enter, arriving by the arrow keys, after an
    // Escape). Tab reaches Close, which shows then; Escape closes from anywhere.
    dialog.current?.focus({ preventScroll: true });
    return () => {
      unsubscribe();
      unslide();
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

  // On to the card beside it (`dir` 1: the next): the row moves on at once, and this card carries on out towards the
  // other side (as `leaving`), from wherever a finger let it go, a step ahead of the next coming in beside it.
  const moveOn = useCallback(
    (dir: -1 | 1) => {
      if (closing.current || !step || !(dir > 0 ? step.next : step.prev)) return;
      closing.current = true;
      video.current?.pause();
      if (reducedMotion()) return step.go(dir);
      step.go(dir, dragX.get());
    },
    [step, dragX],
  );

  // On its way out: a step along, keeping pace with the next card coming in beside it.
  useLayoutEffect(() => {
    if (!leaving || !pane.current) return;
    leavingRef.current = true;
    draw(progress.get());
    const controls = animate(dragX, -leaving * pagerStep(pane.current.offsetWidth), { ...PAGER, onComplete: () => onGone?.() });
    return () => controls.stop();
    // Runs once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // The open card is a step in the history: Back closes it. Closing it any other way takes that step back too, and
  // the card goes when the history says so (popstate), so the two never disagree. A card arrived at by a swipe takes
  // the last one's step rather than adding one, so Back still closes. (Once, even when React runs this twice in
  // development.) Never again for a page re-rendering: a Back (or a click outside) makes Next re-render the page before
  // the popstate arrives, with its own history state in place of ours, and running this again then put the card's
  // step straight back, so the card never closed. `dismiss` is read through a ref for that reason.
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });
  useEffect(() => {
    if (history.state?.soundscapeCard !== card.id) {
      if (enter) history.replaceState({ soundscapeCard: card.id }, "");
      else history.pushState({ soundscapeCard: card.id }, "");
    }
    const onPop = () => {
      if (!leavingRef.current) dismissRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Runs again only if the card changes, which it doesn't (a new card is a new CardDetail).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);
  const close = useCallback(() => {
    if (history.state?.soundscapeCard === card.id) history.back();
    else dismiss();
  }, [card.id, dismiss]);

  useEffect(() => holdPage(), []);

  // Touch: a sideways swipe moves to the next or previous card: the card follows the finger (with a little give and
  // no further at either end of the row) and, let go far or fast enough, slides away as the other slides in; else it
  // springs back. And a drag down puts it away, like a sheet: from the top of its content (scrolled right up), a
  // downward drag pulls the whole card; let go far or fast enough and it goes back into its tile, else it springs back.
  useEffect(() => {
    const el = pane.current;
    const scroller = content.current;
    if (!el || !scroller) return;
    let start: { x: number; y: number; top: boolean } | null = null;
    let mode: "pull" | "slide" | null = null;
    let samples: { t: number; v: number }[] = [];
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // A touch in one of the end card's fields is the field's (moving its caret, scrolling its text).
      start = !closing.current && e.touches.length === 1 && !startsInField(e.target) ? { x: t.clientX, y: t.clientY, top: scroller.scrollTop <= 0 } : null;
      mode = null;
      samples = [];
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!mode) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy) && step) {
          mode = "slide";
          dragX.stop();
        } else if (dy > Math.abs(dx) && start.top && scroller.scrollTop <= 0) {
          mode = "pull";
          dragY.stop();
        } else {
          start = null; // scrolling the card: not ours
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      const v = mode === "pull" ? dy : dx;
      if (mode === "pull") dragY.set(Math.max(0, dy));
      else dragX.set((dx < 0 ? step?.next : step?.prev) ? dx : dx * 0.25);
      samples.push({ t: e.timeStamp, v });
      if (samples.length > 6) samples.shift();
    };
    const onEnd = () => {
      const was = mode;
      start = null;
      mode = null;
      if (!was) return;
      const [a, b] = [samples[0], samples[samples.length - 1]];
      const speed = a && b && b.t > a.t ? ((b.v - a.v) / (b.t - a.t)) * 1000 : 0; // px/s, downward or rightward
      if (was === "pull") {
        if (dragY.get() > 120 || speed > 700) close();
        else animate(dragY, 0, SPRING_BACK);
        return;
      }
      const dx = dragX.get();
      const dir = dx < 0 ? 1 : -1; // a swipe to the left moves on to the next card
      const far = Math.abs(dx) > SWIPE_DISTANCE || (Math.abs(speed) > SWIPE_SPEED && Math.sign(speed) === Math.sign(dx));
      if (far && (dir > 0 ? step?.next : step?.prev)) moveOn(dir);
      else animate(dragX, 0, SPRING_BACK);
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
  }, [close, draw, dragY, dragX, progress, step, moveOn]);

  useEffect(() => {
    // Escape while a video is full screen only leaves full screen (the browser's own), not the card too. The arrow keys
    // move to the next or previous card. Typing in the end card's fields, the arrows move the caret and Escape leaves
    // the field (a second Escape closes).
    const onKey = (e: KeyboardEvent) => {
      if (leavingRef.current) return;
      if (keyStaysInForm(e)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "Escape" && !document.fullscreenElement) close();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") moveOn(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, moveOn]);

  const setPane = useCallback(
    (node: HTMLDivElement | null) => {
      pane.current = node;
      glass.attach(node);
    },
    [glass],
  );

  return createPortal(
    <div ref={dialog} tabIndex={-1} data-card-dialog inert={!!leaving} aria-hidden={leaving ? true : undefined} className={`fixed inset-0 outline-none ${leaving ? "z-[1001]" : "z-[1000]"}`} role="dialog" aria-modal="true" aria-label={!entry ? rowCardLabel(card) : entry.type === "comment" ? entry.snippet : entry.type === "lyric" && entry.lyric ? entry.lyric.excerptOrTimestamp : entry.headline}>
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
            {/* For keyboard and screen-reader users; the design has no visible close control (click outside or Escape). */}
            <button
              onClick={close}
              className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:right-4 focus-visible:z-10 focus-visible:rounded-full focus-visible:bg-white/15 focus-visible:px-3 focus-visible:py-1 focus-visible:text-[13px] focus-visible:text-white"
            >
              Close
            </button>

            {entry ? (
              <>
              {media &&
                ("video" in media ? (
                  // Played right here, with no label (nothing may sit over YouTube's player, and the video says what it is).
                  <CardVideo ref={video} id={media.id} start={media.start} url={entry.url} thumb={media.video} title={entry.headline} />
                ) : (
                  <div className="relative shrink-0">
                    <PosterStage src={media.poster} title={media.title} className="h-[300px] w-full" inset="inset-6" />
                    {/* On the Content kind the label sits on the picture, as on the card. */}
                    <p className={`pointer-events-none absolute top-8 left-8 ${LABEL}`}>{TYPE_LABEL[entry.type]}</p>
                  </div>
                ))}

              <div className={`flex flex-col gap-5 px-8 ${media && !("video" in media) ? "pt-6" : media ? "pt-3" : "pt-8"}`}>
                {!media && <p className={LABEL}>{TYPE_LABEL[entry.type]}</p>}
                {entry.type === "comment" ? (
                  <Quote text={entry.snippet} />
                ) : lyric ? (
                  <LyricQuote text={lyric.excerptOrTimestamp} />
                ) : (
                  <h2 className={HEADLINE}>{entry.headline}</h2>
                )}
                {entry.comment?.replies?.length ? <Replies replies={entry.comment.replies} /> : null}
                {body.map((text, i) => (
                  <p key={i} className={BODY}>
                    {text}
                  </p>
                ))}
                {entry.film?.plotDetails &&
                  (revealed ? (
                    <p className={BODY}>{entry.film.plotDetails}</p>
                  ) : (
                    <button onClick={() => setRevealed(true)} className="self-start text-[16px] text-white/55 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white/75">
                      Spoiler
                    </button>
                  ))}
              </div>

              <div className="mt-auto px-8 pt-8 pb-8">
                <Attribution card={entry} expanded />
              </div>
              </>
            ) : card.type === "visitor" ? (
              <VisitorDetail comment={card.comment} />
            ) : card.type === "end" ? (
              <VisitorForm song={card.song} />
            ) : null}
          </div>

          {/* The tile's face, at the tile's size, while the card grows out of it. */}
          <div ref={face} aria-hidden style={{ transformOrigin: "0 0" }} className={`pointer-events-none absolute top-0 left-0 h-[250px] w-[250px] ${short ? "phone:h-[182px]" : ""}`}>
            <RowTileFace card={card} short={short} />
          </div>

          <GlassEdge look={glass.look} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A visitor's comment, opened: the label, the comment quoted as a comment card's is, and its source line (Soundscape · name · day). */
function VisitorDetail({ comment }: { comment: VisitorComment }) {
  return (
    <>
      <div className="flex flex-col gap-5 px-8 pt-8">
        <p className={LABEL}>{ROW_LABEL.visitor}</p>
        <Quote text={comment.text} />
      </div>
      <div className="mt-auto px-8 pt-8 pb-8">
        <VisitorAttribution comment={comment} expanded />
      </div>
    </>
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
 * clipped at the top of the list, so all of them start from the same point. The line is see-through white, not a grey:
 * the open card is glass, as light or dark as the cover behind it, and the design's #555 vanished on lighter ones. The
 * curves overlap (the trunk above the first reply, each curve where it leaves it), so they're drawn solid on a layer of
 * their own, faded as a whole: faded one by one, the overlaps would add up and show brighter.
 */
function Replies({ replies }: { replies: Reply[] }) {
  const list = "flex flex-col gap-8 overflow-hidden pt-[23px] pl-[49px]";
  const text = (r: Reply, className = "") => <p className={`whitespace-pre-line ${BODY} ${className}`}>“{r.text.trim()}”</p>;
  return (
    <div className="relative -mt-[11px]">
      <ul aria-label="Top replies" className={list}>
        {replies.map((r) => (
          <li key={r.commentId ?? r.text}>{text(r)}</li>
        ))}
      </ul>
      {/* The lines' layer, over the list exactly: an unseen copy of the replies lays it out the same, so each curve meets its reply. */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 opacity-40 ${list}`}>
        {replies.map((r) => (
          <div key={r.commentId ?? r.text} className="relative">
            <span className="absolute bottom-[calc(100%_-_14px)] -left-[33px] h-screen w-[17px] rounded-bl-[17px] border-b-2 border-l-2 border-white" />
            {text(r, "invisible")}
          </div>
        ))}
      </div>
    </div>
  );
}

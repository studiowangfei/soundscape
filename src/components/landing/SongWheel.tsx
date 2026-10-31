"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { claim, HOLD_SLOP, onClaim, release } from "../gesture";
import { WheelMotion } from "./motion";
import { barChrome, SearchBar, type SearchBarProps } from "./SearchBar";
import { CAP_EM, wheelOwnsKeys } from "./settings";
import { centreFloor, focusGap, rowFit, rowLook, travelling, wheelAction, wheelGeometry, wrap, type WheelSettings } from "./wheel";

type Props = {
  titles: string[];
  /** The song the wheel should be on (search, restore): when it changes, the wheel turns there the short way. */
  index: number;
  settings: WheelSettings;
  /** The song nearest the centre changed. */
  onFocus: (i: number) => void;
  /** The wheel set off for a song (where it will come to rest, unless turned again on the way). */
  onAim: (i: number) => void;
  /** The wheel is all but at that song: within a tenth of a row, just settling. */
  onArrive: (i: number) => void;
  /** The wheel came to rest on a song. */
  onRest: (i: number) => void;
  onOpen: (i: number, newTab: boolean) => void;
  /** The serif typeface's key: when it changes, titles are measured again in the new face. */
  fontKey?: string;
  /** A search bar round the centred song (see SearchBar): its look, what's typed and what to do with it. */
  search?: Omit<SearchBarProps, "size" | "titleWidth" | "titleSize" | "cap" | "font" | "hidden" | "onGo" | "compact" | "maxText">;
};

/**
 * The landing page's song wheel: titles on a big drum that turns like the iOS inline picker, a song at a time, and
 * loops. Drag or flick a title, swipe or scroll, or use the keys. Only the rows near the centre are rendered. How it
 * moves is WheelMotion (motion.ts); this component feeds it events and draws it. With a mouse only the titles take the
 * pointer: dragging the empty space between them wipes the fog behind. With a finger a drag anywhere turns the wheel
 * (titles are a small target on a phone), and a press held still wipes the fog instead (see Fog). No focus ring: the
 * wheel spans the window's width, so a ring drew two lines across the page; the bright centred title already shows
 * where it is. On small screens titles are at least ~30 px (centreFloor), and those too long for the width at that
 * size are set smaller to fit (rowFit).
 */
export function SongWheel({ titles, index, settings, onFocus, onAim, onArrive, onRest, onOpen, fontKey, search }: Props) {
  const count = titles.length;
  const rootRef = useRef<HTMLDivElement>(null);

  // Measurements: the window, and the longest title at 100 px in the wheel's typeface (it decides the text size).
  const [view, setView] = useState({ w: 0, h: 0, font: "", loads: 0 });
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const measure = () => setView((v) => ({ ...v, w: window.innerWidth, h: window.innerHeight, font: getComputedStyle(root).fontFamily }));
    measure();
    // Measure again once the typeface has loaded (until then the fallback's widths would be measured).
    void document.fonts
      .load(`400 100px ${getComputedStyle(root).fontFamily}`)
      .catch(() => [])
      .then(() => setView((v) => ({ ...v, loads: v.loads + 1 })));
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fontKey]);
  const widthsAt100 = useMemo(() => {
    if (!view.font) return titles.map(() => 1000);
    const g = document.createElement("canvas").getContext("2d")!;
    g.font = `400 100px ${view.font}`;
    return titles.map((t) => g.measureText(t).width);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure once the typeface has loaded
  }, [titles, view.font, view.loads]);
  // The typeface's capitals ("H"): their height, and how far their middle sits below the middle of a title's line (one
  // line, line-height 1), in em. The search bar's icons are as tall as them and level with them.
  const cap = useMemo(() => {
    if (!view.font) return { em: CAP_EM, shift: 0 };
    const g = document.createElement("canvas").getContext("2d")!;
    g.font = `400 100px ${view.font}`;
    const m = g.measureText("H");
    const em = m.actualBoundingBoxAscent / 100;
    const ascent = m.fontBoundingBoxAscent / 100;
    const descent = m.fontBoundingBoxDescent / 100;
    if (!(em > 0) || !Number.isFinite(ascent + descent)) return { em: CAP_EM, shift: 0 };
    return { em, shift: (ascent - descent) / 2 - em / 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure once the typeface has loaded
  }, [view.font, view.loads]);
  const size = view.w ? view : { w: 1440, h: 900 };
  const compact = size.w < 640;
  const bar = search ? barChrome(search.look, compact, cap.em) : { em: 0, px: 0 };
  const geo = wheelGeometry(settings, size, Math.max(...widthsAt100), bar.em, bar.px, centreFloor(size));
  const fitOf = (k: number) => rowFit(widthsAt100[wrap(k, count)], geo.centerSize, geo.maxText);

  const motion = useRef<WheelMotion | null>(null);
  if (motion.current == null) motion.current = new WheelMotion(count, index, { pitch: geo.pitch, reduced: false });
  const [pos, setPos] = useState(index);
  // Travelling through several songs at once (see travelling()): the search bar fades out until the wheel arrives at its
  // song (onArrive), which becomes where the next move sets off from. A single step never fades it, however it's made.
  const [spun, setSpun] = useState(false);
  const from = useRef(index);
  const loop = useRef(0);
  const aimed = useRef(index);
  const arrived = useRef(index);
  const callbacks = useRef({ onFocus, onAim, onArrive, onRest, onOpen });
  useEffect(() => {
    callbacks.current = { onFocus, onAim, onArrive, onRest, onOpen };
  });
  useEffect(() => {
    const m = motion.current!;
    m.count = count;
    m.opts.pitch = geo.pitch;
    m.opts.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, [count, geo.pitch]);

  /** Ticks the motion every frame until it's at rest (or under the finger). */
  const kick = () => {
    if (loop.current) return;
    const tick = (now: number) => {
      const m = motion.current!;
      const aim = wrap(m.target, m.count);
      if (m.moving && aim !== aimed.current) callbacks.current.onAim((aimed.current = aim));
      const { rested } = m.tick(now);
      if (Math.abs(m.pos - m.target) < 0.1 && aim !== arrived.current) callbacks.current.onArrive((arrived.current = aim));
      setPos(m.pos);
      if (!m.moving || Math.abs(m.pos - m.target) < 0.1) {
        from.current = m.target;
        setSpun(false);
      } else if (travelling(from.current, m.target, m.pos, m.count, false)) setSpun(true);
      if (rested !== null) callbacks.current.onRest(rested);
      loop.current = m.moving ? requestAnimationFrame(tick) : 0;
    };
    loop.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(loop.current), []);

  // Outside requests (search, restore).
  useEffect(() => {
    const m = motion.current!;
    if (index !== wrap(m.target, count)) {
      m.goToSong(index, performance.now());
      kick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the requested song changes
  }, [index]);

  const centreRow = Math.round(pos);
  const centre = wrap(centreRow, count);
  useEffect(() => {
    callbacks.current.onFocus(centre);
  }, [centre]);

  const handleKey = (e: KeyboardEvent | React.KeyboardEvent) => {
    const m = motion.current!;
    if (e.key === "Enter") callbacks.current.onOpen(m.chosen(), e.metaKey || e.ctrlKey);
    else if (m.key(e.key, performance.now())) kick();
    else return;
    e.preventDefault();
  };

  // Scrolling anywhere on the page turns the wheel (except over the Tune panel, which scrolls itself); the arrow keys
  // drive it whenever nothing else has focus.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const ui = e.target instanceof Element ? e.target.closest("[data-backdrop-ui]") : null;
      if (ui && ui !== rootRef.current) return;
      const action = wheelAction(e);
      if (action === "ignore") return;
      e.preventDefault();
      motion.current!.wheel(e.deltaY, action, performance.now());
      kick();
    };
    const onKey = (e: KeyboardEvent) => {
      if (wheelOwnsKeys(document.activeElement === document.body ? null : document.activeElement)) handleKey(e);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs only
  }, []);

  // Touch and pen: a press anywhere but on a control (the search bar's icons, the music switch) takes the wheel: a drag
  // turns it, a tap on a title spins it to the centre (or opens the centred one). The wheel follows the finger at once
  // but only owns the touch once it has moved past HOLD_SLOP (a fingertip wobbles as it presses); if the press is held
  // still the fog claims it first (to wipe) and the wheel lets go, so a long press never opens a song.
  useEffect(() => {
    let touch: number | null = null;
    let landedY = 0;
    const ours = (e: PointerEvent) => e.pointerType !== "mouse" && e.pointerId === touch;
    const letGo = () => {
      touch = null;
      motion.current!.cancel(performance.now());
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || touch !== null) return;
      const t = e.target instanceof Element ? e.target : null;
      const ui = t?.closest("[data-backdrop-ui]");
      if ((ui && ui !== rootRef.current) || t?.closest("button, input, select, textarea, a, [role=dialog]")) return;
      const row = t?.closest("[data-row]");
      cancelAnimationFrame(loop.current);
      loop.current = 0;
      touch = e.pointerId;
      landedY = e.clientY;
      motion.current!.press(e.clientY, row ? Number(row.getAttribute("data-row")) : null, performance.now());
    };
    const onMove = (e: PointerEvent) => {
      if (!ours(e)) return;
      const m = motion.current!;
      m.move(e.clientY, performance.now());
      if (Math.abs(e.clientY - landedY) > HOLD_SLOP && !claim(e.pointerId, "wheel")) return letGo();
      setPos(m.pos);
      if (travelling(from.current, m.target, m.pos, m.count, true)) setSpun(true);
    };
    const onUp = (e: PointerEvent) => {
      if (!ours(e)) return;
      touch = null;
      release(e.pointerId);
      const m = motion.current!;
      if (m.mode !== "drag") return;
      const { open } = m.release(performance.now());
      if (open !== null) callbacks.current.onOpen(open, false);
      else kick();
    };
    const onCancel = (e: PointerEvent) => {
      if (!ours(e)) return;
      release(e.pointerId);
      letGo();
    };
    const offClaim = onClaim((id, who) => id === touch && who !== "wheel" && letGo());
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      offClaim();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  // A mouse press on a title: a drag if it moves more than a few px, otherwise a click on that row. (The wheel captures
  // the pointer, so rows never see their own click; WheelMotion works out taps.) Touch goes through the window (above).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const hit = e.target instanceof Element ? e.target.closest("[data-row]") : null;
    if (!hit) return;
    cancelAnimationFrame(loop.current);
    loop.current = 0;
    motion.current!.press(e.clientY, Number(hit.getAttribute("data-row")), performance.now());
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const m = motion.current!;
    if (e.pointerType !== "mouse" || m.mode !== "drag") return;
    m.move(e.clientY, performance.now());
    setPos(m.pos);
    if (travelling(from.current, m.target, m.pos, m.count, true)) setSpun(true);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || motion.current!.mode !== "drag") return;
    const { open } = motion.current!.release(performance.now());
    if (open !== null) callbacks.current.onOpen(open, e.metaKey || e.ctrlKey);
    else kick();
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    motion.current!.cancel(performance.now());
    kick();
  };

  const id = useId();
  const typing = search?.query != null;
  // The centred title's width, eased between the two rows nearest the centre as the wheel turns (the bar follows it).
  const below = Math.floor(pos);
  const widthAt = (k: number) => fitOf(k).width;
  const titleWidth = widthAt(below) + (widthAt(below + 1) - widthAt(below)) * (pos - below);
  const sizeAt = (k: number) => fitOf(k).size;
  const titleSize = sizeAt(below) + (sizeAt(below + 1) - sizeAt(below)) * (pos - below);
  const rows = [];
  for (let k = Math.floor(pos) - 12; k <= Math.ceil(pos) + 12; k++) {
    const look = rowLook(k - pos, { stepDeg: geo.stepDeg, falloff: settings.falloff, dim: settings.dim });
    if (!look.visible) continue;
    // While typing, what's typed takes the centre: titles fade out as they turn into the bar, and are gone inside it.
    if (typing) look.opacity *= Math.min(1, Math.max(0, Math.abs(k - pos) * 2 - 1));
    const song = wrap(k, count);
    const fit = fitOf(k);
    rows.push(
      <div
        key={k}
        id={`${id}-${k}`}
        role="option"
        aria-selected={k === centreRow}
        aria-setsize={count}
        aria-posinset={song + 1}
        data-row={k}
        onAuxClick={(e) => e.button === 1 && k === centreRow && callbacks.current.onOpen(song, true)}
        className="pointer-events-auto absolute top-1/2 left-1/2 cursor-pointer touch-none whitespace-nowrap leading-none text-white select-none"
        style={{
          fontSize: fit.size,
          ...(fit.clip ? { maxWidth: geo.maxText, overflow: "hidden", textOverflow: "ellipsis" } : {}),
          opacity: look.opacity,
          // The focused song gets focusGap px more room above and below; the rest keep their spacing. The push is made
          // in the row's own depth on the drum, so it's scaled up to undo the perspective (3 × radius): 8 px on screen.
          transform: `translate(-50%, calc(-50% + ${focusGap(k - pos, settings.focusGap) * (1 + (1 - Math.cos((look.angleDeg * Math.PI) / 180)) / 3)}px)) translateZ(${-geo.radius}px) rotateX(${-look.angleDeg}deg) translateZ(${geo.radius}px) scale(${look.scale})`,
          backfaceVisibility: "hidden",
        }}
      >
        {titles[song]}
      </div>,
    );
  }

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Songs"
      tabIndex={0}
      aria-activedescendant={`${id}-${centreRow}`}
      data-backdrop-ui
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={handleKey}
      className="pointer-events-none relative w-full font-serif outline-none"
      style={{ height: Math.min(2 * geo.radius, view.h || 900), perspective: geo.radius * 3 }}
    >
      {rows}
      {search && (
        <SearchBar
          {...search}
          size={geo.centerSize}
          titleWidth={titleWidth}
          titleSize={titleSize}
          cap={cap}
          font={view.font}
          compact={compact}
          maxText={geo.maxText}
          hidden={spun && !typing}
          onGo={(newTab) => callbacks.current.onOpen(motion.current!.chosen(), newTab)}
        />
      )}
    </div>
  );
}

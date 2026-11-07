"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { claim, HOLD_SLOP, onClaim, release } from "../gesture";
import { haptic, useSwitchTicks } from "../haptics";
import { SwitchTick } from "../icon";
import { WheelMotion } from "./motion";
import { SearchBar } from "./SearchBar";
import { wheelOwnsKeys, type SearchBarLook } from "./settings";
import type { SortKey } from "./sort";
import type { WheelLayout } from "./useWheelLayout";
import { focusGap, rowFit, rowLook, travelling, wheelAction, wrap, type WheelSettings } from "./wheel";

type Props = {
  titles: string[];
  /** The song the wheel should be on (restore, rest): when it changes, the wheel turns there the short way. */
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
  /** The wheel's measurements for this window (useWheelLayout, with the same titles, settings and search bar look). */
  layout: WheelLayout;
  /** The bar round the centred song (see SearchBar): its look, and the order its sort menu shows and changes; no bar without it. */
  bar?: { look: SearchBarLook; sort: SortKey; onSort: (key: SortKey) => void };
  /** Told whenever someone turns the wheel themselves: a press or tap on it, a drag, a scroll, a key. */
  onUser?: () => void;
  /** For a spin to a random song (the landing page's 🎲): `ref.current.roll()`. */
  ref?: React.Ref<WheelHandle>;
};

export type WheelHandle = {
  /** Spin to a random song, 2 to 15 songs on. */
  roll: () => void;
  /** On to the next song, as the ↓ key does (the page turning it by itself: not told to onUser). */
  step: () => void;
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
export function SongWheel({ titles, index, settings, onFocus, onAim, onArrive, onRest, onOpen, onUser, layout, bar, ref }: Props) {
  const count = titles.length;
  const rootRef = useRef<HTMLDivElement>(null);

  const { view, widthsAt100, compact, geo } = layout;
  const fitOf = (k: number) => rowFit(widthsAt100[wrap(k, count)], geo.centerSize, geo.maxText);

  const motion = useRef<WheelMotion | null>(null);
  if (motion.current == null) motion.current = new WheelMotion(count, index, { pitch: geo.pitch, reduced: false });
  const [pos, setPos] = useState(index);
  // Travelling through several songs at once (see travelling()): the bar fades out until the wheel arrives at its
  // song (onArrive), which becomes where the next move sets off from. A single step never fades it, however it's made.
  const [spun, setSpun] = useState(false);
  const from = useRef(index);
  const loop = useRef(0);
  const aimed = useRef(index);
  const arrived = useRef(index);
  const callbacks = useRef({ onFocus, onAim, onArrive, onRest, onOpen, onUser });
  useEffect(() => {
    callbacks.current = { onFocus, onAim, onArrive, onRest, onOpen, onUser };
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
      if (m.moving && aim !== aimed.current) {
        callbacks.current.onAim((aimed.current = aim));
      }
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

  // Outside requests (restore, rest).
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
  // Turned by hand (a press, drag, scroll or key; not the 🎲 or the page turning it): each song reaching the middle
  // ticks, where the phone can (haptics.ts). A tap on a title ticks too: a pulse on Android (onUp), and on an iPhone the
  // tap lands on the invisible switch over each title (SwitchTick), which ticks itself.
  const handTurn = useRef(false);
  const byHand = () => {
    handTurn.current = true;
    callbacks.current.onUser?.();
  };
  useEffect(() => {
    callbacks.current.onFocus(centre);
    if (handTurn.current) haptic("step");
  }, [centre]);

  const handleKey = (e: KeyboardEvent | React.KeyboardEvent) => {
    const m = motion.current!;
    if (e.key === "Enter") callbacks.current.onOpen(m.chosen(), e.metaKey || e.ctrlKey);
    else if (m.key(e.key, performance.now())) kick();
    else return;
    byHand();
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
      byHand();
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
      if ((ui && ui !== rootRef.current) || t?.closest("button, input:not([data-tick]), select, textarea, a, [role=dialog]")) return;
      const row = t?.closest("[data-row]");
      byHand();
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
      const { open, tap } = m.release(performance.now());
      if (tap) haptic("tap");
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
    byHand();
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

  // A random spin (the page's 🎲).
  const roll = () => {
    handTurn.current = false;
    motion.current!.roll(Math.random(), performance.now());
    // A spin always travels (several songs, however few songs there are): the bar fades until it lands.
    setSpun(true);
    kick();
  };
  const step = () => {
    handTurn.current = false;
    if (motion.current!.key("ArrowDown", performance.now())) kick();
  };
  useImperativeHandle(ref, () => ({ roll, step }));

  const id = useId();
  const ticks = useSwitchTicks();
  // The centred title's width, eased between the two rows nearest the centre as the wheel turns (the bar follows it).
  const below = Math.floor(pos);
  const widthAt = (k: number) => fitOf(k).width;
  const titleWidth = widthAt(below) + (widthAt(below + 1) - widthAt(below)) * (pos - below);
  const rows = [];
  for (let k = Math.floor(pos) - 12; k <= Math.ceil(pos) + 12; k++) {
    const look = rowLook(k - pos, { stepDeg: geo.stepDeg, falloff: settings.falloff, dim: settings.dim });
    if (!look.visible) continue;
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
          // The focused song gets focusGap × text more room above and below; the rest keep their spacing. The push is
          // made in the row's own depth on the drum, so it's scaled up to undo the perspective (3 × radius).
          transform: `translate(-50%, calc(-50% + ${focusGap(k - pos, settings.focusGap * geo.centerSize) * (1 + (1 - Math.cos((look.angleDeg * Math.PI) / 180)) / 3)}px)) translateZ(${-geo.radius}px) rotateX(${-look.angleDeg}deg) translateZ(${geo.radius}px) scale(${look.scale})`,
          backfaceVisibility: "hidden",
        }}
      >
        {titles[song]}
        {ticks && <SwitchTick />}
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
      {bar && (
        <SearchBar
          look={bar.look}
          sort={bar.sort}
          onSort={bar.onSort}
          size={geo.centerSize}
          titleWidth={titleWidth}
          compact={compact}
          hidden={spun}
          onGo={(newTab) => callbacks.current.onOpen(motion.current!.chosen(), newTab)}
        />
      )}
    </div>
  );
}

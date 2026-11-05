"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SORTS, type SortKey } from "./sort";

/** From the button to the menu, and the least room kept from the window's edges, px. */
const GAP = 8;
const MARGIN = 12;

/**
 * Apple's Liquid Glass menu, from its iOS and iPadOS 26 design kit ("Menu - iPad - Actions", dark; Figma node 5908:8898
 * in the community file): 238 wide, corners 32, padded 10 above and below and 8 at the sides, a soft shadow; rows 40
 * tall (58 with a subtitle), a 24 px checkmark column 6 in, the label 40 in; SF Pro 15/18 (+0.2 tracking) in #F5F5F5,
 * subtitles 13/16 in #8A8A8A, both added to the glass (plus-lighter), as the kit's text is.
 */
const MENU = { width: 238, radius: 32, shadow: "0 8px 40px rgba(0, 0, 0, 0.12)" };
/**
 * The kit's "Liquid Glass - Regular - Medium" tints the glass with a group at 67%: a colour-burned #CCC, black at 60%
 * and white at 6%, which takes what's behind from brightness b to 0.33·b + 0.04 + 0.25·burn(b) (burn(b) = 1.25·b −
 * 0.25, at least 0). Layers can't blend with a pane's own frosted backdrop, so it's done as a filter instead:
 * brightness 0.55 under a 4% white fill gives 0.53·b + 0.04, within ±0.03 of Apple's from dark backdrops to bright. The
 * glass itself, Figma's own effect, has no settings the kit exports: frost (30px, saturated as Apple's materials are)
 * stands in for it, with the site's rim light.
 */
const FROST = "blur(30px) saturate(1.5) brightness(0.55)";
const FILL = "rgba(255, 255, 255, 0.04)";

type Props = {
  /** The button the menu pulls down from (the bar's funnel): its left edge lines up with the button's. */
  anchor: RefObject<HTMLElement | null>;
  /** What the menu opens just below (or above), if more than the button: the whole bar, so it never covers the bar. */
  under?: RefObject<HTMLElement | null>;
  open: boolean;
  value: SortKey;
  onChange: (key: SortKey) => void;
  onClose: () => void;
};

/**
 * The sort menu, a pull-down as iOS and macOS show one: a "Sort By" title, the orders in a column with a checkmark by
 * the one in use, built to Apple's Liquid Glass menu (MENU, FROST). It grows out of its button, below it (above if there's no room),
 * and closes on a choice, Escape, or a press or scroll anywhere else; that press is used up, as on iOS (it doesn't also
 * turn the wheel or press what's under it). The pointer or the arrow keys pick out an order, a click or Enter chooses.
 */
export function SortMenu(props: Props) {
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{props.open && <Menu {...props} />}</AnimatePresence>, document.body);
}

function Menu({ anchor, under, value, onChange, onClose }: Props) {
  const id = useId();
  const pane = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);

  // Placed by its button before the first paint, and again if the window changes size.
  useLayoutEffect(() => {
    const measure = () => {
      const a = anchor.current?.getBoundingClientRect();
      const edge = (under?.current ?? anchor.current)?.getBoundingClientRect();
      const m = pane.current;
      if (!a || !edge || !m) return;
      const left = Math.min(Math.max(MARGIN, a.left), window.innerWidth - m.offsetWidth - MARGIN);
      const below = edge.bottom + GAP + m.offsetHeight <= window.innerHeight - MARGIN;
      const top = below ? edge.bottom + GAP : Math.max(MARGIN, edge.top - GAP - m.offsetHeight);
      // It grows out of the button: from the button's middle, at the edge nearest it.
      setPlace({ left, top, origin: `${a.left + a.width / 2 - left}px ${below ? 0 : m.offsetHeight}px` });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor, under]);

  // The keys go to the menu while it's open.
  useEffect(() => pane.current?.focus({ preventScroll: true }), []);

  // A press, scroll or Escape anywhere else closes it.
  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && !!(pane.current?.contains(t) || anchor.current?.contains(t));
    const press = (e: PointerEvent) => {
      if (inside(e.target)) return;
      e.stopPropagation();
      swallowNextClick();
      onClose();
    };
    const scroll = (e: WheelEvent) => {
      if (inside(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("wheel", scroll, { capture: true, passive: false });
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("wheel", scroll, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);

  const choose = (key: SortKey) => {
    onChange(key);
    onClose();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = SORTS.length;
    const step: Record<string, (i: number | null) => number> = {
      ArrowDown: (i) => (i === null ? 0 : (i + 1) % n),
      ArrowUp: (i) => (i === null ? n - 1 : (i - 1 + n) % n),
      Home: () => 0,
      End: () => n - 1,
    };
    if (step[e.key]) setActive(step[e.key](active));
    else if ((e.key === "Enter" || e.key === " ") && active !== null) choose(SORTS[active].key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <motion.div
      ref={pane}
      role="menu"
      aria-label="Sort by"
      aria-activedescendant={active !== null ? `${id}-${active}` : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
      transition={{ type: "spring", stiffness: 600, damping: 38, mass: 0.7 }}
      // Placed before the first paint (above), so never seen anywhere else; and focusable from the start.
      // Frosted with a plain blur: Chromium's SVG backdrop filter (the cards' refraction) leaves the wheel's titles, which
      // are 3D-transformed, sharp behind it.
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        transformOrigin: place?.origin,
        width: MENU.width,
        borderRadius: MENU.radius,
        boxShadow: MENU.shadow,
        backgroundColor: FILL,
        backdropFilter: FROST,
        WebkitBackdropFilter: FROST,
      }}
      className="fixed z-50 overflow-hidden px-2 py-2.5 font-sans text-[#f5f5f5] outline-none select-none"
    >
      {/* The kit has no title; Apple's guidelines keep one where it adds meaning, as here (a funnel often means a filter). */}
      <p className="relative pt-1 pr-2 pb-1.5 pl-10 text-[13px] leading-4 text-[#8a8a8a] mix-blend-plus-lighter">Sort By</p>
      {SORTS.map((s, i) => (
        <button
          key={s.key}
          id={`${id}-${i}`}
          type="button"
          role="menuitemradio"
          aria-checked={s.key === value}
          tabIndex={-1}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          onClick={() => choose(s.key)}
          // Highlighted under the pointer or the arrow keys (the kit doesn't draw this state): a capsule, its ends concentric
          // with the menu's corners.
          className={`relative flex min-h-10 w-full cursor-pointer items-center gap-1.5 rounded-[20px] pr-2 pl-1.5 text-left transition-colors ${active === i ? "bg-white/12" : ""}`}
        >
          {/* SF Symbols' checkmark, semibold 17/22, in a 24 × 22 column. */}
          <span aria-hidden className="grid h-[22px] w-6 shrink-0 place-items-center mix-blend-plus-lighter">
            {s.key === value && (
              <svg viewBox="0 0 16 16" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 8.6l3.6 3.6L13.5 4.3" />
              </svg>
            )}
          </span>
          <span className="flex flex-col gap-0.5 py-[11px] pl-1">
            <span className="text-[15px] leading-[18px] tracking-[0.2px] mix-blend-plus-lighter">{s.label}</span>
            {s.detail && <span className="text-[13px] leading-4 text-[#8a8a8a] mix-blend-plus-lighter">{s.detail}</span>}
          </span>
        </button>
      ))}
      <span aria-hidden className="glass-edge" style={{ "--edge": 0.4 } as React.CSSProperties} />
    </motion.div>
  );
}

/**
 * The click that follows a press which closed the menu goes nowhere (a press that never becomes a click, a drag,
 * doesn't keep the next one from landing).
 */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  window.addEventListener("pointerdown", () => window.removeEventListener("click", stop, true), { capture: true, once: true });
}

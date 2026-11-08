"use client";

import { useEffect, useRef, useState } from "react";
import { CardDetail } from "./CardDetail";
import { CardTile } from "./CardTile";
import type { RowCard } from "./row";
import type { MobileCard } from "./variants";
import { wheelAction } from "../landing/wheel";
import { useStage } from "../backdrops/Stage";

/** A tile's width plus the gap after it: one step along the row. */
const STEP = 250 + 13;

/**
 * The song's cards in one row along the foot of the page, running off its right edge (13px apart, snapping card by
 * card). One card opens at a time: its tile hides while the open card (CardDetail) grows out of it and shrinks back.
 * Fingers and sideways trackpad swipes scroll the row natively; a swipe past either end never turns into the
 * browser's back/forward (overscroll-x-contain). A vertical mouse wheel moves the row a card per notch, a vertical
 * trackpad swipe moves it along with the fingers, until it reaches an end and the page scrolls on. `cards`: the
 * song's own, then visitors' comments, then the end card (row.ts). `mobile`: the cards' variant on phones (Tune → Cards).
 */
export function CardGrid({ cards, mobile = "standard", className = "" }: { cards: RowCard[]; mobile?: MobileCard; className?: string }) {
  const short = mobile === "short";
  // The cards rise once the page's arrival has got going (partway into the cover's move, coming from another page).
  const { entranceDelay } = useStage();
  const [delay] = useState(entranceDelay);
  // The open card, and the side it came in from when it was swiped to (0: opened from its tile), with where the last
  // card was then (so the two keep a step apart). Each opening is its own CardDetail (`uid`).
  const [opened, setOpened] = useState<{ id: string; uid: number; enter: -1 | 0 | 1; from: number } | null>(null);
  // The cards on their way out, beside the one coming in (still the same CardDetail, so nothing redraws).
  const [leaving, setLeaving] = useState<{ id: string; uid: number; enter: -1 | 0 | 1; dir: -1 | 1 }[]>([]);
  const uid = useRef(0);
  const openId = opened?.id ?? null;
  const at = cards.findIndex((c) => c.id === openId);
  const open = at >= 0 ? cards[at] : undefined;
  const row = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already sideways (trackpads)
      const atEnd = e.deltaY > 0 ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 : el.scrollLeft <= 0;
      if (atEnd) return; // let the page scroll on
      e.preventDefault();
      if (wheelAction(e) === "notch") el.scrollBy({ left: Math.sign(e.deltaY) * STEP, behavior: "smooth" });
      else el.scrollBy({ left: e.deltaY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const tileBox = () => {
    const r = (openId && tiles.current.get(openId)?.getBoundingClientRect()) || new DOMRect(0, 0, 250, 250);
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  return (
    <>
      {/* The row starts about the cards' own gap under the player (12px; 13 on phones), and on phones the cards between
          the first and the last come to rest in the middle of the screen (CardTile's snap). */}
      <div ref={row} className={`scrollbar-hide flex snap-x snap-mandatory scroll-px-page gap-[13px] overflow-x-auto overscroll-x-contain px-page py-3 phone:pt-[13px] ${className}`}>
        {cards.map((card, i) => (
          <CardTile
            key={card.id}
            card={card}
            index={i}
            delay={delay}
            snap={i === 0 ? "first" : i === cards.length - 1 ? "last" : "middle"}
            short={short}
            hidden={card.id === openId}
            onOpen={(el) => {
              tiles.current.set(card.id, el);
              setOpened({ id: card.id, uid: ++uid.current, enter: 0, from: 0 });
            }}
          />
        ))}
      </div>
      {/* One list, so a card going from open to on its way out stays the same CardDetail (keyed by its opening). */}
      {[...leaving, ...(open && opened ? [opened] : [])].map((o) => {
        const card = cards.find((c) => c.id === o.id);
        if (!card) return null;
        if ("dir" in o)
          return (
            <CardDetail
              key={o.uid}
              card={card}
              tile={tileBox}
              short={short}
              enter={o.enter}
              leaving={o.dir}
              onGone={() => setLeaving((ls) => ls.filter((x) => x.uid !== o.uid))}
              onClosed={() => {}}
            />
          );
        return (
          <CardDetail
            key={o.uid}
            card={card}
            tile={tileBox}
            short={short}
            enter={o.enter}
            from={o.from}
            step={{
              prev: at > 0,
              next: at < cards.length - 1,
              // On to the card either side: its tile is brought into view in the row (behind the open card), so closing
              // goes back to it. This card stays on, on its way out beside the next one coming in (none, reduced motion).
              go: (dir, from) => {
                const to = cards[at + dir];
                const el = row.current?.children[at + dir];
                if (!to) return;
                if (el instanceof HTMLElement && row.current) {
                  tiles.current.set(to.id, el);
                  const [r, t] = [row.current.getBoundingClientRect(), el.getBoundingClientRect()];
                  row.current.scrollBy({ left: t.left - r.left - (r.width - t.width) / 2, behavior: "instant" });
                }
                if (from !== undefined) setLeaving((ls) => [...ls, { id: o.id, uid: o.uid, enter: o.enter, dir }]);
                setOpened({ id: to.id, uid: ++uid.current, enter: dir, from: from ?? 0 });
              },
            }}
            onClosed={() => {
              const el = tiles.current.get(o.id);
              setOpened(null);
              requestAnimationFrame(() => el?.focus({ preventScroll: true })); // once it's visible again
            }}
          />
        );
      })}
    </>
  );
}

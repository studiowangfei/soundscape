"use client";

import { useEffect, useRef, useState } from "react";
import type { EntryCard } from "@/content/schema";
import { CardDetail } from "./CardDetail";
import { CardTile } from "./CardTile";

/**
 * The song's cards in one row along the foot of the page, running off its right edge (13px apart, snapping card by
 * card). One card opens at a time: its tile hides while the open card (CardDetail) grows out of it and shrinks back.
 * A mouse wheel scrolls the row sideways until it reaches an end.
 */
export function CardGrid({ cards, className = "" }: { cards: EntryCard[]; className?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = cards.find((c) => c.id === openId);
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
      el.scrollBy({ left: e.deltaY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const tileBox = () => {
    const r = (openId && tiles.current.get(openId)?.getBoundingClientRect()) || new DOMRect(0, 0, 250, 276);
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  return (
    <>
      <div ref={row} className={`scrollbar-hide flex snap-x snap-mandatory scroll-pl-5 gap-[13px] overflow-x-auto px-5 py-3 sm:scroll-pl-20 sm:px-20 ${className}`}>
        {cards.map((card, i) => (
          <CardTile
            key={card.id}
            card={card}
            index={i}
            hidden={card.id === openId}
            onOpen={(el) => {
              tiles.current.set(card.id, el);
              setOpenId(card.id);
            }}
          />
        ))}
      </div>
      {open && (
        <CardDetail
          key={open.id}
          card={open}
          tile={tileBox}
          onClosed={() => {
            const el = tiles.current.get(open.id);
            setOpenId(null);
            requestAnimationFrame(() => el?.focus({ preventScroll: true })); // once it's visible again
          }}
        />
      )}
    </>
  );
}

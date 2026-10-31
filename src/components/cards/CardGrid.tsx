"use client";

import { useEffect, useRef, useState } from "react";
import type { EntryCard } from "@/content/schema";
import { CardDetail } from "./CardDetail";
import { CardTile } from "./CardTile";
import { wheelAction } from "../landing/wheel";

/** A tile's width plus the gap after it: one step along the row. */
const STEP = 250 + 13;

/**
 * The song's cards in one row along the foot of the page, running off its right edge (13px apart, snapping card by
 * card). One card opens at a time: its tile hides while the open card (CardDetail) grows out of it and shrinks back.
 * Fingers and sideways trackpad swipes scroll the row natively; a swipe past either end never turns into the
 * browser's back/forward (overscroll-x-contain). A vertical mouse wheel moves the row a card per notch, a vertical
 * trackpad swipe moves it along with the fingers, until it reaches an end and the page scrolls on.
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
      {/* On phones the row starts the cards' own gap (13px) under the player, and the cards between the first and the last
          come to rest in the middle of the screen (CardTile's snap). */}
      <div ref={row} className={`scrollbar-hide flex snap-x snap-mandatory scroll-px-page gap-[13px] overflow-x-auto overscroll-x-contain px-page py-3 phone:pt-[13px] ${className}`}>
        {cards.map((card, i) => (
          <CardTile
            key={card.id}
            card={card}
            index={i}
            snap={i === 0 ? "first" : i === cards.length - 1 ? "last" : "middle"}
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

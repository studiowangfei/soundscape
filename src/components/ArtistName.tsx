"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Entrance, OnBackdrop } from "./backdrops/Stage";

/**
 * The song page's artist, its letters the inverse of the backdrop behind them, in grey: a copy takes the colour out of
 * the backdrop within the letters (saturation), and the name over it, white, is the difference from that grey. So it
 * reads on any cover, letter by letter, and stays monochrome. Both are drawn on the backdrop (OnBackdrop), not in the
 * page, where blend modes upset Chrome's glass; the page keeps the name as invisible text in its place, for the layout,
 * selection and screen readers, and the drawn name follows it. `held`: wait to come up (song to song, until the cover's
 * crossfade is over); `out`: fade away (leaving the page).
 */
export function ArtistName({ name, held, out }: { name: string; held: boolean; out: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width ? b : { left: r.left, top: r.top, width: r.width }));
    };
    // It settles as the fonts load and the page lays out; after that it moves only as the page scrolls or resizes.
    let raf = 0;
    const until = performance.now() + 1500;
    const settle = () => {
      place();
      if (performance.now() < until) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);
    const observer = new ResizeObserver(place);
    observer.observe(el);
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, []);
  return (
    <>
      <p ref={ref} className="mt-1 text-[24px] text-transparent">
        {name}
      </p>
      {box && (
        <OnBackdrop>
          <div className={`absolute text-[24px] ${held ? "entrance-hold" : ""} ${out ? "ink-out" : ""}`} style={{ left: box.left, top: box.top, width: box.width }}>
            <Entrance as="span" byColour className="absolute inset-0 text-[#808080] mix-blend-saturation">
              {name}
            </Entrance>
            <Entrance as="span" byColour className="relative block text-white/85 mix-blend-difference">
              {name}
            </Entrance>
          </div>
        </OnBackdrop>
      )}
    </>
  );
}

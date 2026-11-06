"use client";

import { Entrance, OnBackdrop } from "../backdrops/Stage";

// As the Figma design places it (Desktop 263:13, Mobile 281:30): top left, 36px in, 15px with 4.5px tracking on desktops
// and tablets; on phones (`phone:`) centred at the top, 24px down, 11px with 3.3px tracking. Clear of a notch.
const PLACE =
  "pointer-events-none absolute font-sans text-[15px] leading-none font-medium tracking-[4.5px] whitespace-nowrap select-none transition-opacity duration-200 ease-out top-[max(36px,calc(env(safe-area-inset-top)+0.5rem))] left-[max(36px,calc(env(safe-area-inset-left)+0.5rem))] phone:top-[max(24px,env(safe-area-inset-top))] phone:left-1/2 phone:-translate-x-1/2 phone:text-[11px] phone:tracking-[3.3px]";

/**
 * The app's name on the landing page. Its letters are the backdrop's inverse, in grey, as a song page's artist is
 * (ArtistName): a copy underneath takes the colour out of the backdrop within the letters (saturation), and the name over
 * it, white at the design's 75%, is the difference from that grey, so it reads on any cover, letter by letter, and stays
 * monochrome. Both are drawn on the backdrop itself (OnBackdrop), over the scene and under the page: blend modes in the
 * page upset Chrome's glass (the song page's cards flashed white), and the landing page's own layers, fixed and fading,
 * would cut them off from the backdrop. They fade up as the page arrives and out with it (`leaving`). The backdrop is
 * hidden from screen readers, so the page keeps the name for them.
 */
export function Wordmark({ leaving }: { leaving: boolean }) {
  const out = leaving ? "opacity-0" : "";
  return (
    <>
      <p className="sr-only">soundscape</p>
      <OnBackdrop>
        <span className={`${PLACE} ${out} text-[#808080] mix-blend-saturation`}>
          <Entrance as="span">soundscape</Entrance>
        </span>
        <span className={`${PLACE} ${out} text-white mix-blend-difference`}>
          <Entrance as="span" className="opacity-75">
            soundscape
          </Entrance>
        </span>
      </OnBackdrop>
    </>
  );
}

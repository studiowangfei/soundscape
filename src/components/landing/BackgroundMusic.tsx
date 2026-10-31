"use client";

import { useEffect } from "react";
import { useSoundtrack } from "../player/Soundtrack";

/**
 * The landing page's music switch, a 48 px 🔇 / 🔊 centred below the wheel, for the site's soundtrack
 * (player/Soundtrack.tsx): on, it loops the background song's preview, following the background from song to song, and
 * plays on into a song page. `src` is the background song's preview (null: it has none); undefined until the background
 * is up, so arriving from a song page doesn't interrupt what's playing.
 */
export function BackgroundMusic({ src }: { src: string | null | undefined }) {
  const { on, toggle, follow } = useSoundtrack();
  useEffect(() => {
    if (src !== undefined) follow(src);
  }, [src, follow]);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // a click leaves the focus where it was, so the arrow keys still turn the wheel
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute the music" : "Play the music"}
      title={on ? "Mute the music" : "Play the music"}
      // 28px up, or clear of a phone's home indicator (the page runs edge to edge: viewportFit "cover").
      className="fixed bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.75rem))] left-1/2 z-30 grid size-16 -translate-x-1/2 cursor-pointer place-items-center rounded-full text-[48px] leading-none transition-colors hover:bg-white/10"
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}

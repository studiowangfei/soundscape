"use client";

import { useEffect } from "react";
import { EmojiButton, LANDING_MUSIC } from "../icon";
import { useSoundtrack } from "../player/Soundtrack";

/**
 * The landing page's music switch, a 🔇 / 🔊 (top right on desktops, bottom right on phones: icon.tsx LANDING_MUSIC)
 * drawn as big as the site's other icons, for the site's soundtrack (player/Soundtrack.tsx): on, it loops the background
 * song's preview, following the background from song to song, and plays on into a song page. `src` is the background song's preview (null: it has none); undefined
 * while there's nothing new to follow: until the background is up, so arriving from a song page doesn't interrupt
 * what's playing, and while the wheel turns (Landing: musicSong). `box` is the icons' box, px (iconBox); null until the
 * wheel is measured.
 */
export function BackgroundMusic({ src, box }: { src: string | null | undefined; box: number | null }) {
  const { on, toggle, follow } = useSoundtrack();
  useEffect(() => {
    if (src !== undefined) follow(src);
  }, [src, follow]);
  return (
    <EmojiButton
      emoji={on ? "🔊" : "🔇"}
      box={box}
      onClick={toggle}
      // "Sound", on or off (a screen reader says which: aria-pressed).
      aria-pressed={on}
      aria-label="Sound"
      title="Sound"
      className={LANDING_MUSIC}
    />
  );
}

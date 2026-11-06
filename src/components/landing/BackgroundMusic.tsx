"use client";

import { useEffect } from "react";
import { EmojiButton, LANDING_MUSIC } from "../icon";
import { useSoundtrack } from "../player/Soundtrack";

/**
 * The landing page's music switch, a 🔇 / 🔊 in the bottom right corner drawn as big as the site's other icons, for the
 * site's soundtrack (player/Soundtrack.tsx): on, it loops the background song's preview, following the background from
 * song to song, and plays on into a song page. `src` is the background song's preview (null: it has none); undefined
 * until the background is up, so arriving from a song page doesn't interrupt what's playing. `box` is the icons' box, px
 * (iconBox); null until the wheel is measured.
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
      aria-pressed={on}
      aria-label={on ? "Mute the music" : "Play the music"}
      title={on ? "Mute the music" : "Play the music"}
      className={LANDING_MUSIC}
    />
  );
}

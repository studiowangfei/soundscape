/**
 * What the site's icons share (the search bar's funnel and Arrow, a song page's Close, the landing page's emoji: the music
 * switch and the 🎲): one size for what's drawn, everywhere, set by the landing wheel's text (landing/settings.ts
 * iconBox); no shadows. The drawn ones are half opaque, fully under the pointer; the emoji are fully opaque and grow a
 * little under it.
 */

/** Phosphor draws its icons 13/16 as big as their box (208 of 256), so every icon's box is its drawing's 16/13. */
export const DRAWING = 13 / 16;

/** Apple's emoji fill 0.98 of their type size, so an emoji drawn as big as an icon is set at its drawing ÷ this. */
export const EMOJI_INK = 0.98;

/**
 * A drawn icon's opacity: 50% at rest (or --icon-a: the search bar's are tuned in Tune → Search bar, 50% by default),
 * fully opaque under the pointer (hover screens only).
 */
export const ICON_HOVER = "opacity-[var(--icon-a,0.5)] transition-opacity hover:opacity-100";

/** The top right corner, 20px in (or clear of a phone's notch and rounded corner: the page runs edge to edge). */
export const TOP_RIGHT =
  "fixed top-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))] right-[max(1.25rem,calc(env(safe-area-inset-right)+0.5rem))] z-30 grid place-items-center";

/** The bottom right corner, the same way in (clear of a phone's home indicator and rounded corner). */
export const BOTTOM_RIGHT =
  "fixed bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-[max(1.25rem,calc(env(safe-area-inset-right)+0.5rem))] z-30 grid place-items-center";

/** The bottom left corner, the same way in. */
export const BOTTOM_LEFT =
  "fixed bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-[max(1.25rem,calc(env(safe-area-inset-left)+0.5rem))] z-30 grid place-items-center";

/**
 * An emoji as an icon button: drawn as big as the others in a box `box` px square (null: not measured yet, so hidden),
 * fully opaque, 5% bigger under the pointer (hover screens only). A click leaves the focus where it was, so the arrow
 * keys still turn the wheel.
 */
export function EmojiButton({ emoji, box, className, ...button }: { emoji: string; box: number | null } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "style">) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      {...button}
      className={`${className} cursor-pointer leading-none transition-transform hover:scale-105 ${box ? "" : "invisible"}`}
      style={{ width: box ?? 0, height: box ?? 0, fontSize: ((box ?? 0) * DRAWING) / EMOJI_INK }}
    >
      {box && <Hit size={box} />}
      {emoji}
    </button>
  );
}

/** An invisible target round a small icon, at least 44 px square: what a fingertip needs, however small it's drawn. */
export function Hit({ size }: { size: number }) {
  return <span aria-hidden className="absolute" style={{ inset: -Math.max(0, (44 - size) / 2) }} />;
}

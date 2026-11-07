import { haptic, useSwitchTicks } from "./haptics";

/**
 * What the site's icons share (the search bar's funnel and Arrow, a song page's Close, the landing page's emoji: the music
 * switch, the 🎲 and the 💧): one size for what's drawn, everywhere, set by the landing wheel's text (landing/settings.ts
 * iconBox); no shadows. The drawn ones are half opaque, fully under the pointer; the emoji are fully opaque and grow
 * 1.4× under it.
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
 * The landing page's emoji, placed as the Figma design has them (Desktop 263:13, Mobile 281:30). On desktops and tablets
 * in the corners, 36px in: the 💧 top right, the 🎲 bottom left, the music bottom right. On phones (`phone:`) in a row
 * along the bottom, 28px in: the 💧 on the left, the 🎲 in the middle, the music on the right. Always clear of a phone's
 * notch, home indicator and rounded corners.
 */
export const LANDING_DROP =
  "fixed z-30 grid place-items-center top-[max(36px,calc(env(safe-area-inset-top)+0.5rem))] right-[max(36px,calc(env(safe-area-inset-right)+0.5rem))] phone:top-auto phone:right-auto phone:bottom-[max(28px,calc(env(safe-area-inset-bottom)+0.5rem))] phone:left-[max(28px,calc(env(safe-area-inset-left)+0.5rem))]";
export const LANDING_DICE =
  "fixed z-30 grid place-items-center bottom-[max(36px,calc(env(safe-area-inset-bottom)+0.5rem))] left-[max(36px,calc(env(safe-area-inset-left)+0.5rem))] phone:bottom-[max(28px,calc(env(safe-area-inset-bottom)+0.5rem))] phone:left-1/2 phone:-translate-x-1/2";
export const LANDING_MUSIC =
  "fixed z-30 grid place-items-center bottom-[max(36px,calc(env(safe-area-inset-bottom)+0.5rem))] right-[max(36px,calc(env(safe-area-inset-right)+0.5rem))] phone:bottom-[max(28px,calc(env(safe-area-inset-bottom)+0.5rem))] phone:right-[max(28px,calc(env(safe-area-inset-right)+0.5rem))]";

/**
 * An emoji as an icon button: drawn as big as the others in a box `box` px square (null: not measured yet, so hidden),
 * fully opaque, 1.4× as big under the pointer (hover screens only). A click leaves the focus where it was, so the
 * arrow keys still turn the wheel. A tap on a touch screen ticks (haptics.ts): a pulse on Android, the switch's own
 * tick on an iPhone (SwitchTick).
 */
export function EmojiButton({ emoji, box, className, onClick, ...button }: { emoji: string; box: number | null } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "style">) {
  const ticks = useSwitchTicks();
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      {...button}
      onClick={(e) => {
        haptic("tap");
        onClick?.(e);
      }}
      className={`${className} cursor-pointer leading-none transition-transform hover:scale-[1.4] ${box ? "" : "invisible"}`}
      style={{ width: box ?? 0, height: box ?? 0, fontSize: ((box ?? 0) * DRAWING) / EMOJI_INK }}
    >
      {box && <Hit size={box} />}
      {emoji}
      {box && ticks && <SwitchTick size={box} />}
    </button>
  );
}

/**
 * An iPhone's tick for a tap (it has no vibrate): an invisible native switch over the whole target (a `size` px icon's,
 * as big as Hit's; without one, its parent's), which the finger taps itself (a switch toggled from script stays silent
 * on recent iOS). The click goes on up to the control. Hidden from assistive tech and the keyboard, and it gives the
 * focus straight back. Marked data-tick, so the song wheel still takes a press on it (SongWheel).
 */
export function SwitchTick({ size }: { size?: number }) {
  const pad = size == null ? 0 : Math.max(0, (44 - size) / 2);
  return (
    <input
      type="checkbox"
      {...{ switch: "" }}
      data-tick
      aria-hidden
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.currentTarget.blur()}
      className="absolute m-0 cursor-pointer opacity-0"
      style={size == null ? { inset: 0, width: "100%", height: "100%" } : { left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad }}
    />
  );
}

/** An invisible target round a small icon, at least 44 px square: what a fingertip needs, however small it's drawn. */
export function Hit({ size }: { size: number }) {
  return <span aria-hidden className="absolute" style={{ inset: -Math.max(0, (44 - size) / 2) }} />;
}

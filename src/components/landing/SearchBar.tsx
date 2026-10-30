"use client";

import type { SearchBarLook } from "./settings";

/** The text's line height, in em (the Figma design's 64 px line at 52 px). */
const LINE = 64 / 52;
/** "No match", after what's typed: its size and the gap before it, in em. */
const NOTE = 0.28;
const NOTE_GAP = 0.35;

/** How much wider the bar is than the text in it: `em` of the wheel's text plus `px` of stroke. */
export const barChrome = (look: SearchBarLook) => ({ em: 2 * (look.padX + look.icon + look.gap), px: 2 * look.stroke });

export type SearchBarProps = {
  /** The wheel's text size at the centre, px. */
  size: number;
  /** How wide the centred title is right now, px (it follows the wheel as it turns). */
  titleWidth: number;
  /** The wheel's font family, to measure what's typed. */
  font: string;
  look: SearchBarLook;
  /** Faded out (the wheel is travelling through several songs). */
  hidden: boolean;
  /** What's typed; null when not searching, and the bar shows the centred song. */
  query: string | null;
  noMatch: boolean;
  /** The search icon: clear the bar for typing. */
  onSearch: () => void;
  onQuery: (q: string) => void;
  onEnter: () => void;
  /** Escape, or the bar lost focus: stop searching. */
  onDone: () => void;
  /** The arrow: open the song in the bar. */
  onGo: (newTab: boolean) => void;
};

/**
 * The search bar round the wheel's centred song: a rounded outline that fits the title (following the wheel as it
 * turns), a search icon on the left and an arrow on the right; its look comes from the Tune panel. The search icon
 * clears the bar and takes typing (it then fits what's typed, and the wheel's own title hides behind it); the arrow
 * opens the song. It fades out while the wheel travels through several songs, and back in as it arrives.
 */
export function SearchBar({ size, titleWidth, font, look, hidden, query, noMatch, onSearch, onQuery, onEnter, onDone, onGo }: SearchBarProps) {
  const typing = query !== null;
  const text = typing ? Math.max(size * 0.5, measure(query, `400 ${size}px ${font || "serif"}`)) : titleWidth;
  const note = typing && noMatch ? NOTE_GAP * size + measure("No match", `400 ${NOTE * size}px system-ui, sans-serif`) : 0;
  const chrome = barChrome(look);
  const icon = (opacity: number) => ({ width: look.icon * size, height: look.icon * size, "--icon": look.iconColor, "--icon-a": opacity }) as React.CSSProperties;
  const iconClass = `shrink-0 cursor-pointer text-[rgb(var(--icon)/var(--icon-a))] transition-colors hover:text-[rgb(var(--icon))] ${hidden ? "pointer-events-none" : "pointer-events-auto"}`;
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 flex items-center rounded-full border-solid"
      style={{
        width: text + note + chrome.em * size + chrome.px,
        height: (LINE + 2 * look.padY) * size + chrome.px,
        borderWidth: look.stroke,
        borderColor: `rgb(${look.strokeColor} / ${look.strokeOpacity})`,
        padding: `0 ${look.padX * size}px`,
        transform: "translate(-50%, -50%)",
        opacity: hidden ? 0 : 1,
        // Out quickly once the wheel is travelling, back in gently as it arrives.
        transition: [hidden ? "opacity 120ms ease-out" : "opacity 280ms ease-in", typing && "width 150ms ease-out"].filter(Boolean).join(", "),
      }}
    >
      <button type="button" aria-label="Search songs" onMouseDown={keepFocus} onClick={onSearch} className={iconClass} style={icon(look.searchOpacity)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-full w-full">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center" style={{ margin: `0 ${look.gap * size}px` }}>
        {typing && (
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation(); // the wheel's own keys (arrows, Enter) stay out of the typing
              if (e.key === "Enter") onEnter();
              else if (e.key === "Escape") onDone();
            }}
            onBlur={onDone}
            aria-label="Search songs or artists"
            spellCheck={false}
            autoComplete="off"
            className="pointer-events-auto bg-transparent p-0 text-center leading-none text-white caret-white outline-none"
            style={{ width: text + 2, fontSize: size }}
          />
        )}
        {typing && noMatch && (
          <span className="shrink-0 whitespace-nowrap font-sans text-white/45" style={{ fontSize: NOTE * size, marginLeft: NOTE_GAP * size }}>
            No match
          </span>
        )}
      </div>
      <button type="button" aria-label="Open this song" onMouseDown={keepFocus} onClick={(e) => onGo(e.metaKey || e.ctrlKey)} className={iconClass} style={icon(look.arrowOpacity)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
          <path d="M3.5 12h17M13.5 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// Pressing an icon mid-typing must not blur the input first: the bar would shrink back to the title and the icon slide
// out from under the pointer before the click.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

let measurer: CanvasRenderingContext2D | null = null;

/** The width of `s` in `font` (CSS shorthand). */
function measure(s: string, font: string) {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  measurer.font = font;
  return measurer.measureText(s).width;
}

"use client";

import { useCallback, useRef, useState } from "react";
import { Hit, ICON_HOVER } from "../icon";
import { barParts, type SearchBarLook } from "./settings";
import type { SortKey } from "./sort";
import { SortMenu } from "./SortMenu";

export type SearchBarProps = {
  /** The wheel's text size at the centre, px. */
  size: number;
  /** How wide the centred title is right now, px (it follows the wheel as it turns). */
  titleWidth: number;
  look: SearchBarLook;
  /** Narrow screens: padding and gaps in px (see COMPACT_BAR). */
  compact?: boolean;
  /** Faded out (the wheel is travelling through several songs). */
  hidden: boolean;
  /** The wheel's order (the funnel's sort menu), and choosing another. */
  sort: SortKey;
  onSort: (key: SortKey) => void;
  /** The arrow: open the song in the bar. */
  onGo: (newTab: boolean) => void;
};

/**
 * The bar round the wheel's centred song (the search bar, as the Figma design names it; its search lives on in the git
 * tag search-bar-v1, its dice in dice-v1): a rounded outline that fits the title, following the wheel as it turns, a
 * funnel on the left and an arrow on the right; its look comes from the Tune panel. The funnel opens the sort menu
 * (SortMenu); the arrow opens the song. It fades out while the wheel travels through several songs, and back in as it arrives. The icons take a
 * fingertip-sized tap round them, however small they're drawn.
 */
export function SearchBar({ size, titleWidth, look, compact = false, hidden, sort, onSort, onGo }: SearchBarProps) {
  const root = useRef<HTMLDivElement>(null);
  const funnel = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  // Sized as in the Figma design, in em of the wheel's text; the icons centred on the bar.
  const parts = barParts(look, size, compact);
  const icon = (opacity: number) => ({ width: parts.icon, height: parts.icon, "--icon": look.iconColor, "--icon-a": opacity }) as React.CSSProperties;
  const iconClass = `relative shrink-0 cursor-pointer text-[rgb(var(--icon))] ${ICON_HOVER} ${hidden ? "pointer-events-none" : "pointer-events-auto"}`;

  return (
    <div
      ref={root}
      className="pointer-events-none absolute top-1/2 left-1/2 flex items-center rounded-full border-solid"
      style={{
        width: titleWidth + 2 * (parts.icon + parts.padX + parts.gap),
        // The stroke is inside the outline (border-box) and the padding counts from the outline, as in the design.
        height: parts.height,
        borderWidth: look.stroke,
        borderColor: `rgb(${look.strokeColor} / ${look.strokeOpacity})`,
        padding: `0 ${Math.max(0, parts.padX - look.stroke)}px`,
        transform: "translate(-50%, -50%)",
        opacity: hidden ? 0 : 1,
        // Out quickly once the wheel is travelling, back in gently as it arrives.
        transition: hidden ? "opacity 120ms ease-out" : "opacity 280ms ease-in",
      }}
    >
      <button
        ref={funnel}
        type="button"
        aria-label="Sort songs"
        title="Sort"
        aria-haspopup="menu"
        aria-expanded={menu}
        onMouseDown={keepFocus}
        onClick={() => setMenu((m) => !m)}
        className={iconClass}
        style={icon(menu ? 1 : look.searchOpacity)}
      >
        <Hit size={parts.icon} />
        {/* Phosphor's funnel-simple (MIT; svg/funnel-simple.svg) in its own box, as the design places its icons. */}
        <svg viewBox="0 0 256 256" fill="currentColor" className="h-full w-full">
          <path d="M200,136a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H192A8,8,0,0,1,200,136Zm32-56H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-80,96H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z" />
        </svg>
      </button>
      <SortMenu anchor={funnel} under={root} open={menu} value={sort} onChange={onSort} onClose={closeMenu} />
      {/* The title in between is the wheel's own. */}
      <div className="min-w-0 flex-1" style={{ margin: `0 ${parts.gap}px` }} />
      <button type="button" aria-label="Open this song" onMouseDown={keepFocus} onClick={(e) => onGo(e.metaKey || e.ctrlKey)} className={iconClass} style={icon(look.arrowOpacity)}>
        <Hit size={parts.icon} />
        {/* Phosphor's arrow-circle-right (MIT; svg/arrow-circle-right.svg) in its own box, as the design places it. */}
        <svg viewBox="0 0 256 256" fill="currentColor" className="h-full w-full">
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm45.66-93.66a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32-11.32L148.69,136H88a8,8,0,0,1,0-16h60.69l-18.35-18.34a8,8,0,0,1,11.32-11.32Z" />
        </svg>
      </button>
    </div>
  );
}

// A click leaves the focus where it was, so the arrow keys still turn the wheel (they do when nothing has focus).
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

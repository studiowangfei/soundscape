"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { Neighbours, SongLink } from "@/content/neighbours";
import { GlassEdge, useGlass } from "../glass/Glass";
import { PLAYER_HEIGHT, PLAYER_INSET } from "../glass/settings";
import { ListenOn } from "./ListenOn";
import type { StreamLinks } from "./stream-links";
import { useSoundtrack } from "./Soundtrack";
import { clock } from "./youtube";

/**
 * The song's official 30-second preview (iTunes, streamed from the store), on a loop, in a 499×68 glass bar: the
 * cover on the left; in the middle previous / play / next, with the position bar under them; and on the right the song
 * on Spotify, Apple Music and YouTube Music. Every control shows a light circle on hover. The cover links to the song on Apple Music (Apple asks previews to credit
 * the store). Previous and next go to the songs either side of this one, in the landing wheel's order. Without a
 * preview the bar stays, its play button disabled. It plays through the site's soundtrack (Soundtrack.tsx), so music on
 * from the landing page plays on here without a break, and on into the previous or next song.
 */
export function PreviewBar({ cover, preview, nav, links, onSkip }: { cover: string; preview?: { url: string; link: string }; nav?: Neighbours | null; links?: StreamLinks; onSkip?: (href: string) => void }) {
  const track = useSoundtrack();
  const { attach, style, filter, look } = useGlass("player");

  const { follow } = track;
  useEffect(() => follow(preview?.url ?? null), [preview?.url, follow]);
  const mine = !!preview && track.src === preview.url;

  // The cover's corners follow the bar's: its radius is the bar's less the inset, so the gap stays even round the bend.
  const art = (
    // eslint-disable-next-line @next/next/no-img-element -- local cover
    <img src={cover} alt="" className="size-12 object-cover" style={{ borderRadius: look.radius - PLAYER_INSET }} />
  );

  return (
    <div ref={attach} style={{ ...style, height: PLAYER_HEIGHT, paddingLeft: PLAYER_INSET }} className="glass relative flex w-full max-w-[499px] items-center justify-between gap-2 overflow-hidden pr-4 min-[400px]:gap-4">
      {filter}
      {preview ? (
        <a href={preview.link} target="_blank" rel="noopener noreferrer" title="Open in Apple Music" className="relative shrink-0">
          {art}
        </a>
      ) : (
        <span className="relative shrink-0">{art}</span>
      )}
      {/* The controls and the position bar fill the cover's height, less 4px at the top, so they sit as far in from the
          bar's bottom as it does and 4px further from its top: the icons' and the scrubber's own boxes (their hover
          circles, the touch target) overflow their rows, centred, without moving them. */}
      <div className="relative mt-[4px] flex h-[44px] w-[240px] min-w-0 flex-col items-center justify-between">
        <div className="flex h-5 items-center gap-3 min-[400px]:gap-6">
          {nav && <SkipLink to={nav.prev} next={false} onSkip={onSkip} />}
          <PlayButton playing={track.on && mine} onClick={track.toggle} disabled={!preview} />
          {nav && <SkipLink to={nav.next} next onSkip={onSkip} />}
        </div>
        <div className="flex h-3 w-full min-w-0 items-center justify-center">
          {preview ? (
            <Scrubber value={mine ? track.time : 0} max={mine ? track.duration : 30} onSeek={track.seek} knobOnDrag />
          ) : (
            <p className="truncate text-[12px] text-white/55">No preview available</p>
          )}
        </div>
      </div>
      {/* Pulled in by the 4px each mark has round it in its target, so the last one meets the padding. */}
      {links && <ListenOn links={links} className="relative -mr-1 shrink-0" />}
      <GlassEdge look={look} />
    </div>
  );
}

/**
 * Previous or next song (⏮ / ⏭): a quiet icon link either side of the play button. `onSkip` takes the in-app
 * navigation over (the page plays its way out first); a ⌘-click or middle click still opens a new tab.
 */
function SkipLink({ to, next, onSkip }: { to: SongLink; next: boolean; onSkip?: (href: string) => void }) {
  const label = `${next ? "Next" : "Previous"} song: ${to.title}`;
  const href = `/songs/${to.slug}/`;
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        if (!onSkip) return;
        e.preventDefault();
        onSkip(href);
      }}
      aria-label={label}
      title={label}
      className="hit relative grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
    >
      <svg viewBox="0 0 16 16" className={`size-6 ${next ? "" : "-scale-x-100"}`} fill="currentColor" aria-hidden>
        <path d="M3 3.6v8.8a.7.7 0 0 0 1.1.6l6.6-4.4a.7.7 0 0 0 0-1.2L4.1 3a.7.7 0 0 0-1.1.6Z" />
        <rect x="11.6" y="3" width="1.8" height="10" rx=".6" />
      </svg>
    </Link>
  );
}

/** The player's play/pause button: a plain white triangle, two bars while playing; a light circle shows on hover. */
export function PlayButton({ playing, onClick, disabled }: { playing: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? "Pause" : "Play"}
      className="hit relative grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden>
        {playing ? (
          <>
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </>
        ) : (
          <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.1-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6Z" />
        )}
      </svg>
    </button>
  );
}

/**
 * The players' slim position bar, elapsed time on the left and the length on the right. `knobOnDrag`: its knob shows
 * only while it's pressed and dragged (or focused from the keyboard).
 */
export function Scrubber({ value, max, onSeek, disabled, knobOnDrag }: { value: number; max: number; onSeek: (s: number) => void; disabled?: boolean; knobOnDrag?: boolean }) {
  const end = max || 1;
  const at = Math.min(value, end);
  const [dragging, setDragging] = useState(false);
  // Let go anywhere (the pointer can leave the bar mid-drag).
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 text-[12px] text-white/55 tabular-nums min-[400px]:gap-4 ${disabled ? "opacity-40" : ""}`}>
      <span>{clock(value)}</span>
      <input
        type="range"
        min={0}
        max={end}
        step={0.1}
        value={at}
        disabled={disabled}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Position"
        onPointerDown={knobOnDrag ? () => setDragging(true) : undefined}
        data-knob={knobOnDrag ? (dragging ? "shown" : "hidden") : undefined}
        className="scrub min-w-0 flex-1"
        style={{ "--p": `${(at / end) * 100}%` } as CSSProperties}
      />
      <span>{clock(max)}</span>
    </div>
  );
}

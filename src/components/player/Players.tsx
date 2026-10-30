"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Neighbours, SongLink } from "@/content/neighbours";
import { GlassEdge, useGlass } from "../glass/Glass";
import { PLAYER_HEIGHT, PLAYER_INSET } from "../glass/settings";
import { ListenOn } from "./ListenOn";
import type { StreamLinks } from "./stream-links";
import { announcePlay, clock, onOtherPlay } from "./youtube";

/**
 * The song's official 30-second preview (iTunes, streamed from the store), on a loop, in a 499×68 glass bar: the
 * cover on the left; in the middle previous / play / next, with the position bar under them; and on the right the song
 * on Spotify, Apple Music and YouTube Music. Every control shows a light circle on hover. The cover links to the song on Apple Music (Apple asks previews to credit
 * the store). Previous and next go to the songs either side of this one, in the landing wheel's order. Without a
 * preview the bar stays, its play button disabled.
 */
export function PreviewBar({ cover, preview, nav, links }: { cover: string; preview?: { url: string; link: string }; nav?: Neighbours | null; links?: StreamLinks }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const { attach, style, filter, look } = useGlass("player");

  useEffect(() => onOtherPlay("preview", () => audio.current?.pause()), []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      announcePlay("preview");
      void a.play();
    } else a.pause();
  };

  // The cover's corners follow the bar's: its radius is the bar's less the inset, so the gap stays even round the bend.
  const art = (
    // eslint-disable-next-line @next/next/no-img-element -- local cover
    <img src={cover} alt="" className="size-12 object-cover" style={{ borderRadius: look.radius - PLAYER_INSET }} />
  );

  return (
    <div ref={attach} style={{ ...style, height: PLAYER_HEIGHT, paddingLeft: PLAYER_INSET }} className="glass relative flex w-full max-w-[499px] items-center justify-between gap-4 overflow-hidden pr-4">
      {filter}
      {preview ? (
        <a href={preview.link} target="_blank" rel="noopener noreferrer" title="Open in Apple Music" className="relative shrink-0">
          {art}
        </a>
      ) : (
        <span className="relative shrink-0">{art}</span>
      )}
      <div className="relative flex w-[240px] min-w-0 flex-col items-center gap-0.5">
        <div className="flex items-center gap-6">
          {nav && <SkipLink to={nav.prev} next={false} />}
          <PlayButton playing={playing} onClick={toggle} disabled={!preview} />
          {nav && <SkipLink to={nav.next} next />}
        </div>
        <div className="flex w-full min-w-0 justify-center">
          {preview ? (
            <Scrubber
              value={time}
              max={duration}
              onSeek={(s) => {
                if (audio.current) audio.current.currentTime = s;
                setTime(s);
              }}
            />
          ) : (
            <p className="truncate text-[12px] text-white/55">No preview available</p>
          )}
        </div>
      </div>
      {/* Pulled in by the 4px each mark has round it in its target, so the last one meets the padding. */}
      {links && <ListenOn links={links} className="relative -mr-1 shrink-0" />}
      {preview && (
        <audio
          ref={audio}
          src={preview.url}
          preload="none"
          loop
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 30)}
        />
      )}
      <GlassEdge light={look.light} />
    </div>
  );
}

/** Previous or next song (⏮ / ⏭): a quiet icon link either side of the play button. */
function SkipLink({ to, next }: { to: SongLink; next: boolean }) {
  const label = `${next ? "Next" : "Previous"} song: ${to.title}`;
  return (
    <Link
      href={`/songs/${to.slug}/`}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
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
      className="grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
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

/** The players' slim position bar, elapsed time on the left and the length on the right. */
export function Scrubber({ value, max, onSeek, disabled }: { value: number; max: number; onSeek: (s: number) => void; disabled?: boolean }) {
  const end = max || 1;
  const at = Math.min(value, end);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-4 text-[12px] text-white/55 tabular-nums ${disabled ? "opacity-40" : ""}`}>
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
        className="scrub min-w-0 flex-1"
        style={{ "--p": `${(at / end) * 100}%` } as CSSProperties}
      />
      <span>{clock(max)}</span>
    </div>
  );
}

"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Scrubber } from "./Players";
import { announcePlay, loadYouTube, onOtherPlay, type YTPlayer } from "./youtube";

/** `start`: where to start, in seconds (a long set starts where the song plays; replays start there too). */
type Props = { id: string; start: number; url: string; thumb: string; title: string; ref?: Ref<{ pause(): void }> };

/**
 * A YouTube video played right in the open card, with as little of YouTube's own UI as its rules allow. The player
 * loads as soon as the card opens (a click then starts it in about a second) but stays out of sight until the video is
 * actually playing: before that, and again once it ends, the card shows our own clean thumbnail, so YouTube's title
 * bar, play button and end screen of suggestions never show. (Paused or hovered, the player shows YouTube's overlays;
 * those stay.) Play and pause are on the video itself: our thumbnail's play button, then YouTube's own (a click on the
 * video). YouTube's controls are off and a minimal bar under the video has the position and full screen (the video and
 * the bar together, the bar still below the picture). Nothing sits over the player.
 * Videos whose owners block playback on other sites (much label music) say so at once: the thumbnail stays, linking
 * to YouTube. Starting the video pauses the song's preview, and the other way round.
 */
export function CardVideo({ id, start, url, thumb, title, ref }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");
  const [playing, setPlaying] = useState(false);
  // Shown only from the moment it plays until it ends; our thumbnail stands in the rest of the time.
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(start);
  const [duration, setDuration] = useState(0);
  const [full, setFull] = useState(false);
  // Full screen of an arbitrary element (not a <video>): not on iPhone, where the button is left out.
  const [canFull] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);

  useImperativeHandle(ref, () => ({ pause: () => player.current?.pauseVideo?.() }), []);

  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    // YouTube swaps this element for its iframe, so React never manages it.
    const el = document.createElement("div");
    host.current.appendChild(el);
    loadYouTube().then(
      (YT) => {
        if (!alive) return;
        player.current = new YT.Player(el, {
          videoId: id,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: window.location.origin, enablejsapi: 1, ...(start > 0 ? { start: Math.floor(start) } : {}) },
          events: {
            onReady: () => {
              if (!alive) return;
              setDuration(player.current?.getDuration() ?? 0);
              setState("ready");
            },
            onStateChange: (e) => {
              setPlaying(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
              if (e.data === YT.PlayerState.PLAYING) {
                announcePlay("video"); // the preview stops
                setStarted(true);
                setDuration(player.current?.getDuration() ?? 0);
              } else if (e.data === YT.PlayerState.ENDED) {
                // Back to our thumbnail rather than YouTube's end screen of suggestions, ready to start over.
                setStarted(false);
                setTime(start);
              }
            },
            // 101/150: blocked on other sites; 100: removed or private; 2/5: bad id or HTML5 trouble.
            onError: () => alive && setState("blocked"),
          },
        });
      },
      () => alive && setState("blocked"), // the player script didn't load (offline, blocked): link out instead
    );
    return () => {
      alive = false;
      player.current?.destroy();
      player.current = null;
      el.remove();
    };
  }, [id, start]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTime(player.current?.getCurrentTime() ?? 0), 250);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => onOtherPlay("video", () => player.current?.pauseVideo?.()), []);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    const el = frame.current;
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void frame.current?.requestFullscreen().catch(() => {});
  };

  // Our thumbnail's play button (only there before the video starts and after it ends).
  const play = () => {
    const p = player.current;
    if (!p || state !== "ready") return;
    announcePlay("video");
    if (start > 0) p.seekTo(start, true); // a replay starts where the song plays too
    p.playVideo();
  };

  return (
    <div ref={frame} className={full ? "flex flex-col bg-black" : "shrink-0"}>
      {/* YouTube asks for at least 200×200: on narrow screens the frame stays 200 tall and the video letterboxes. Full
          screen, the video takes all the height the bar leaves. */}
      <div className={`relative w-full bg-black ${full ? "min-h-0 flex-1" : "aspect-video min-h-[200px]"}`}>
        {state === "blocked" ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="group absolute inset-0 block" aria-label={`Watch on YouTube: ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail */}
            <img src={thumb} alt="" className="size-full object-cover" />
            <span className="absolute inset-0 grid place-items-center bg-black/15 transition group-hover:bg-black/5">
              <span className="grid size-14 place-items-center rounded-full bg-white/90 pl-1 text-xl text-black shadow-lg transition group-hover:scale-105">▶</span>
            </span>
          </a>
        ) : (
          !started && (
            // Our thumbnail until the video plays (a click on it plays it too, once the player is ready).
            <button
              onClick={play}
              disabled={state !== "ready"}
              aria-label={`Play video: ${title}`}
              className="group absolute inset-0 block cursor-pointer disabled:cursor-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail */}
              <img src={thumb} alt="" className="size-full object-cover" />
              {state === "ready" && (
                <span className="absolute inset-0 grid place-items-center transition group-hover:bg-black/10">
                  <span className="grid size-12 place-items-center rounded-full bg-white/85 pl-0.5 text-[15px] text-black shadow-lg transition group-hover:scale-105">▶</span>
                </span>
              )}
            </button>
          )
        )}
        <div ref={host} className={`absolute inset-0 [&>iframe]:size-full ${state === "ready" && started ? "" : "invisible"}`} />
      </div>
      <div className="flex h-14 items-center gap-4 px-8">
        {state === "blocked" ? (
          <p className="text-[14px] text-white/55">
            Plays on YouTube only ·{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white">
              Watch on YouTube
            </a>
          </p>
        ) : (
          <>
            <Scrubber
              value={time}
              max={duration}
              disabled={state !== "ready"}
              onSeek={(s) => {
                player.current?.seekTo(s, true);
                setTime(s);
              }}
            />
            {canFull && (
              <button
                onClick={toggleFull}
                disabled={state !== "ready"}
                aria-label={full ? "Exit full screen" : "Full screen"}
                className="-mr-2 grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={full ? "M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" : "M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"} />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

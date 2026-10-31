"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { announcePlay, onOtherPlay } from "./youtube";

const ID = "soundtrack";
const VOLUME = 0.8;
/** ms: out quickly when stopping or leaving a song, in gently. */
const FADE_OUT = 300;
const FADE_IN = 700;

export type Soundtrack = {
  /** The song's preview being followed (null: this song has none, so it's quiet). */
  src: string | null;
  /** Switched on (by the landing page's 🔇/🔊 or a song page's play button). */
  on: boolean;
  time: number;
  duration: number;
  /** The page shows this song now: the soundtrack moves to its preview, from 0:00 (fading over, if it's playing). */
  follow: (src: string | null) => void;
  toggle: () => void;
  seek: (s: number) => void;
};

const Ctx = createContext<Soundtrack | null>(null);

export function useSoundtrack(): Soundtrack {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSoundtrack needs a SoundtrackProvider (app/layout.tsx)");
  return s;
}

/**
 * The site's one soundtrack: the 30-second preview of the song you're looking at, on a loop. It lives in the root
 * layout, above the pages, so it plays on without a break from the landing page into a song page and from song to song:
 * each page says which song it shows (`follow`), and the track changes with a fade. Off until switched on (browsers only
 * let sound start from a click); a card video starting switches it off.
 */
export function SoundtrackProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(30);
  // A song switched to starts from the beginning: `fresh` until its track is next loaded (or wound back).
  const followed = useRef<string | null>(null);
  const fresh = useRef(false);

  useEffect(() => onOtherPlay(ID, () => setOn(false)), []);

  // A browser that won't start sound without a click switches it off; an interrupted start (the song changed) doesn't.
  const play = useCallback((a: HTMLAudioElement) => {
    announcePlay(ID);
    return a.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "NotAllowedError") setOn(false);
    });
  }, []);
  const load = (a: HTMLAudioElement, s: string) => {
    const wind = fresh.current;
    fresh.current = false;
    if (a.dataset.src === s) {
      if (wind) a.currentTime = 0; // back to a song that was still loaded, paused part way
      return;
    }
    a.dataset.src = s;
    a.src = s;
    a.volume = 0;
    setTime(0);
  };

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    let live = true;
    let stop = () => {};
    if (!on || !src) {
      stop = ramp(a, 0, FADE_OUT, () => a.pause());
    } else {
      const start = () => {
        load(a, src);
        void play(a).then(() => {
          if (live && !a.paused) stop = ramp(a, VOLUME, FADE_IN);
        });
      };
      // Another song is playing: let it fade out first.
      if (!a.paused && a.dataset.src !== src) stop = ramp(a, 0, FADE_OUT, start);
      else start();
    }
    return () => {
      live = false;
      stop();
    };
  }, [on, src, play]);

  const value: Soundtrack = {
    src,
    on,
    time,
    duration,
    follow: useCallback((s: string | null) => {
      if (followed.current === s) return; // the same song, e.g. into its page from the landing wheel: it plays on
      followed.current = s;
      fresh.current = true;
      setTime(0);
      setSrc(s);
    }, []),
    toggle: () => {
      const next = !on;
      setOn(next);
      // Start right in the click (some browsers allow sound only there); the effect above then fades it in.
      const a = audio.current;
      if (next && a && src) {
        load(a, src);
        a.volume = 0;
        void play(a);
      }
    },
    seek: (s: number) => {
      const a = audio.current;
      if (a && src) {
        load(a, src);
        a.currentTime = s;
      }
      setTime(s);
    },
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio
        ref={audio}
        loop
        preload="none"
        // Only the followed song's time (not the last one's as it fades out).
        onTimeUpdate={(e) => e.currentTarget.dataset.src === src && setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 30)}
      />
    </Ctx.Provider>
  );
}

/** Eases the volume to `to` over `ms`, then calls `done`. Returns the cancel. */
function ramp(a: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = a.volume;
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - t0) / ms)); // a frame's time can be a little before t0
    a.volume = from + (to - from) * t;
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

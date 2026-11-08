"use client";

import { useEffect, useRef } from "react";
import { FOG_PLAYED } from "../gesture";
import { useSoundtrack } from "../player/Soundtrack";
import { autoTick, type AutoState } from "./auto";
import type { WheelHandle } from "./SongWheel";

/**
 * Turns the landing wheel on by itself (see autoTick): every 6 s, or with the music on, after 30 s of each preview. `song` is
 * where the wheel rests and `preview` that song's preview; `userAt` is when the visitor last turned the wheel, and playing
 * with the fog (wiping it, or the 💧: heard at the window, gesture.ts FOG_PLAYED) holds it still too. Starts
 * afresh each time the page is shown (coming back from a song page too). Off for reduced motion. A component of its
 * own, so the soundtrack's clock re-renders only this.
 */
export function AutoRotate({ wheel, ready, song, preview, userAt }: { wheel: React.RefObject<WheelHandle | null>; ready: boolean; song: number; preview: string | null; userAt: React.RefObject<number> }) {
  const { on, src, time, duration } = useSoundtrack();
  const live = useRef({ ready, song, preview, on, src, time, duration });
  useEffect(() => {
    live.current = { ready, song, preview, on, src, time, duration };
  });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let state: AutoState | null = null;
    let fogAt = 0;
    const onFog = () => void (fogAt = performance.now());
    window.addEventListener(FOG_PLAYED, onFog);
    const id = window.setInterval(() => {
      const s = live.current;
      if (!s.ready) return;
      const playing = !!s.preview && s.on && s.src === s.preview;
      const r = autoTick(state, { now: performance.now(), song: s.song, userAt: userAt.current, fogAt, music: s.on, hasPreview: !!s.preview, playing, time: s.time, duration: s.duration, hidden: document.hidden });
      state = r.state;
      if (r.step) wheel.current?.step();
    }, 250);
    return () => {
      clearInterval(id);
      window.removeEventListener(FOG_PLAYED, onFog);
    };
  }, [wheel, userAt]);
  return null;
}

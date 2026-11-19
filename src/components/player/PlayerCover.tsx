"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useScreenCover } from "../backdrops/Stage";
import { driftPath, TIMING } from "../backdrops/stage-model";
import { coverAt, coverSize } from "../cover";

const never = () => () => {};

/**
 * The player's thumbnail: the song cover the backdrop has on screen (Stage's useScreenCover), so on a turn to another
 * song it changes with the backdrop, not as the next page arrives (which can be before the next song's backdrop has
 * drawn, or halfway through its handover). It hands over as the backdrop does: the next cover fades in over the last,
 * which stays solid, both drifting the way the songs turn (`drift` px: up to the next song, down to the previous; none
 * if the backdrop doesn't drift), each filling the strip its move uncovers with its own reflection. It keeps time with
 * the backdrop's own handover (its start, length and easing), so the two move as one, even when the next page mounts
 * halfway through. Before the backdrop has a song on screen (a page opened afresh), the page's own cover, `own`.
 *
 * The same files as the backdrop loads (coverAt), so the page downloads each cover once; the screen's size is known
 * only in the browser, so the server leaves the box empty.
 */
export function PlayerCover({ own, drift, radius }: { own: string; drift: number; radius: number }) {
  const size = useSyncExternalStore(never, coverSize, () => null);
  const { cover, turn, handover } = useScreenCover();
  const fromRef = useRef<HTMLImageElement>(null);
  const toRef = useRef<HTMLImageElement>(null);
  const turnId = turn?.id;
  const d = turn ? Math.sign(turn.drift) * drift : 0;

  useLayoutEffect(() => {
    const [fromEl, toEl] = [fromRef.current, toRef.current];
    if (turnId === undefined || !fromEl || !toEl) return;
    // Started at once, held at their start until they're set to the backdrop's clock (its pane's fade in starts in the
    // same commit, after this, or already has: a page mounted midway). Until then, the backdrop's timing for a turn
    // (stage-model.ts enterHow): with Reduce motion, at once, as the backdrop switches.
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timing = { duration: still ? 0 : TIMING.handover, easing: "ease", fill: "both" as const };
    const anims = [toEl.animate([{ opacity: 0, transform: `translateY(${driftPath("entering", d)[0]}px)` }, { opacity: 1, transform: "none" }], timing)];
    if (d) {
      anims.push(fromEl.animate([{ transform: "none" }, { transform: `translateY(${driftPath("leaving", d)[1]}px)` }], timing));
      fromEl.style.setProperty("-webkit-box-reflect", d > 0 ? "below" : "above");
      toEl.style.setProperty("-webkit-box-reflect", d > 0 ? "above" : "below");
    }
    let gone = false;
    let frame = 0;
    const keepTime = (pane: Animation) => {
      if (gone || pane.startTime === null) return;
      for (const a of anims) a.startTime = pane.startTime;
    };
    const sync = (tries: number) => {
      const pane = handover(turnId);
      if (!pane) {
        if (tries > 0) frame = requestAnimationFrame(() => sync(tries - 1));
        return;
      }
      const { duration, easing } = pane.effect!.getTiming();
      for (const a of anims) a.effect!.updateTiming({ duration: typeof duration === "number" ? duration : TIMING.handover, easing });
      if (pane.startTime !== null) keepTime(pane);
      else pane.ready.then(() => keepTime(pane), () => {});
    };
    sync(3);
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
      for (const a of anims) a.cancel();
      for (const el of [fromEl, toEl]) el.style.removeProperty("-webkit-box-reflect");
    };
  }, [turnId, d, handover]);

  // The cover going under the one coming in, then the one on screen: keyed by file, so the one on screen stays the same
  // element as it goes under, and the one coming in as it settles (no reload, no flash).
  const showing = turn ? [turn.from, cover!] : [cover ?? own];
  return (
    // Clipped to the bar's curve, its moving covers too (isolate: Safari clips them only then).
    <span data-player-cover className="relative isolate block size-12 overflow-hidden" style={{ borderRadius: radius }}>
      {size &&
        showing.map((url, i) => {
          const coming = !!turn && i === 1;
          return (
            // eslint-disable-next-line @next/next/no-img-element -- local cover
            <img
              key={url}
              ref={turn && i === 0 ? fromRef : toRef}
              src={coverAt(url, size)}
              alt=""
              decoding="sync"
              // Held at its start until its animation takes over (it starts as this goes up).
              style={coming ? { opacity: 0, transform: `translateY(${d}px)` } : undefined}
              className="absolute inset-0 size-full object-cover"
            />
          );
        })}
    </span>
  );
}

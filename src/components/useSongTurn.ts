"use client";

import { useEffect, useRef } from "react";
import { onClaim } from "./gesture";
import { wheelAction } from "./landing/wheel";
import { keyTurn, touchTurn, WheelTurn, type PageDir } from "./paging";

// For the whole visit, not per page: a trackpad swipe's momentum runs on into the next song's page.
const wheelTurn = new WheelTurn();

const page = () => document.scrollingElement ?? document.documentElement;
const atTop = () => page().scrollTop <= 0;
const atBottom = () => page().scrollTop + window.innerHeight >= page().scrollHeight - 1;
const cardOpen = () => !!document.querySelector("[data-card-dialog]");
const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || !!t.closest("input, textarea, select"));
/** Where a gesture is never a turn: the open card, the Tune panel, form fields. */
const outOfBounds = (t: EventTarget | null) => typingIn(t) || (t instanceof Element && !!t.closest("[data-card-dialog], [data-backdrop-ui]"));

/** Whether a wheel's `dy` scrolls something under `target`: a box that can still scroll that way, or the page. */
function scrollsWith(target: EventTarget | null, dy: number): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll") continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return dy > 0 ? !atBottom() : !atTop();
}

/**
 * A song page's vertical gestures, turning it to the next or previous song (paging.ts has the rules): a finger's swipe,
 * a trackpad swipe or mouse wheel notch, ↑ / ↓. `onTurn` is called with the way to go.
 */
export function useSongTurn(onTurn: (dir: PageDir) => void) {
  const turn = useRef(onTurn);
  useEffect(() => {
    turn.current = onTurn;
  });

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const action = wheelAction(e);
      // Pinches, sideways scrolls (the card row's), and what the card row took (a mouse wheel moves it) aren't turns.
      if (action === "ignore" || e.defaultPrevented || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const blocked = cardOpen() || outOfBounds(e.target) || scrollsWith(e.target, e.deltaY);
      const dir = wheelTurn.wheel(e.deltaY, action, e.timeStamp, blocked);
      if (dir) turn.current(dir);
    };

    // A finger, from touchstart to touchend. Touch events go on even once the browser has taken the touch (to scroll),
    // which pointer events don't.
    let touch: { x: number; y: number; t: number; scroll: number; top: boolean; bottom: boolean; fog: boolean; multi: boolean } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (touch) return void (touch.multi = true);
      const f = e.touches[0];
      if (e.touches.length !== 1 || !f || cardOpen() || outOfBounds(e.target)) return;
      touch = { x: f.clientX, y: f.clientY, t: e.timeStamp, scroll: page().scrollTop, top: atTop(), bottom: atBottom(), fog: false, multi: false };
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = touch;
      const f = e.changedTouches[0];
      if (!t || !f || e.touches.length) return;
      touch = null;
      if (e.type === "touchcancel") return;
      const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
      const dir = touchTurn({ dx: f.clientX - t.x, dy: f.clientY - t.y, ms: e.timeStamp - t.t, fog: t.fog, multi: t.multi, scrolled: page().scrollTop !== t.scroll, atTop: t.top, atBottom: t.bottom, zoomed });
      if (dir) turn.current(dir);
    };
    // A press held still wipes the fog (backdrops/variants.tsx): that touch isn't a swipe.
    const offClaim = onClaim((_, who) => {
      if (who === "fog" && touch) touch.fog = true;
    });

    const onKey = (e: KeyboardEvent) => {
      const dir = keyTurn(e, { typing: typingIn(e.target), dialog: cardOpen(), canScrollUp: !atTop(), canScrollDown: !atBottom() });
      if (!dir) return;
      e.preventDefault();
      turn.current(dir);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      offClaim();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

"use client";

import { useEffect, useRef } from "react";
import { MOTION_ALLOWED, shakeTick, type ShakeState } from "./shake";

/** Drops from one shake start this far apart, ms, so they run down one after another rather than all at once. */
const STAGGER_MS = 140;

/**
 * Shake the phone and drops fall down the glass (shake.ts): `onDrop` is called once per drop. Touch screens only, and
 * only while `ready` and the page is in sight. Needs the motion sensor, which is HTTPS only and, on an iPhone, asked for
 * by the 💧 (askMotion); without it, shaking does nothing.
 */
export function ShakeDrops({ ready, onDrop }: { ready: boolean; onDrop: () => void }) {
  const live = useRef({ ready, onDrop });
  useEffect(() => {
    live.current = { ready, onDrop };
  });
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches || typeof DeviceMotionEvent === "undefined") return;
    let state: ShakeState | null = null;
    let gravity: [number, number, number] | null = null;
    const timers: number[] = [];
    const onMotion = (e: DeviceMotionEvent) => {
      // How the phone is moving: its acceleration without gravity, or (where the browser gives only the reading with
      // gravity) that, less gravity as a slow running average of it.
      let a: [number, number, number];
      const m = e.acceleration;
      if (m?.x != null && m.y != null && m.z != null) a = [m.x, m.y, m.z];
      else {
        const g = e.accelerationIncludingGravity;
        if (g?.x == null || g.y == null || g.z == null) return;
        const raw: [number, number, number] = [g.x, g.y, g.z];
        gravity = gravity ? (gravity.map((v, i) => v * 0.8 + raw[i] * 0.2) as [number, number, number]) : raw;
        a = [raw[0] - gravity[0], raw[1] - gravity[1], raw[2] - gravity[2]];
      }
      const r = shakeTick(state, { now: performance.now(), a });
      state = r.state;
      if (!r.drops || !live.current.ready || document.hidden) return;
      for (let i = 0; i < r.drops; i++) timers.push(window.setTimeout(() => live.current.ready && live.current.onDrop(), i * STAGGER_MS));
    };
    const listen = () => {
      window.removeEventListener("devicemotion", onMotion);
      window.addEventListener("devicemotion", onMotion);
    };
    listen();
    window.addEventListener(MOTION_ALLOWED, listen);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener(MOTION_ALLOWED, listen);
      timers.forEach(clearTimeout);
    };
  }, []);
  return null;
}

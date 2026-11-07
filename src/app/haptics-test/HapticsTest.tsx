"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Each way a web page can make a phone tick, to tap on real devices (see the conversation of 2026-11-06):
 *  A. a native switch, visible (does this phone tick for a switch at all?);
 *  B. an invisible switch over a button, tapped directly (the overlay libraries use; said to survive iOS 26.5);
 *  C. a button whose click clicks a hidden switch's label from script (the older trick; said to be closed in iOS 26.5);
 *  D. navigator.vibrate on a tap (Android Chrome; iOS Safari has none);
 *  E. navigator.vibrate while dragging, a tick every 40 px (what the song wheel would use on Android).
 */
export function HapticsTest() {
  const [log, setLog] = useState<string[]>([]);
  const [env, setEnv] = useState("");
  const say = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 30));
  const hiddenLabel = useRef<HTMLLabelElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState({ b: 0, e: 0 });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's details exist only in the browser
    setEnv(`${navigator.userAgent}\nnavigator.vibrate: ${"vibrate" in navigator ? "present" : "absent"} · switch attribute: ${"switch" in document.createElement("input") ? "supported" : "not supported"}`);
  }, []);

  // E: a tick every 40 px of drag.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let last: number | null = null;
    const down = (e: PointerEvent) => {
      last = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (last === null || Math.abs(e.clientX - last) < 40) return;
      last = e.clientX;
      const ok = typeof navigator.vibrate === "function" ? navigator.vibrate(8) : "no API";
      setCount((c) => ({ ...c, e: c.e + 1 }));
      if (ok !== true) say(`E: vibrate while dragging returned ${String(ok)}`);
    };
    const up = () => (last = null);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  const card = "rounded-2xl bg-white/8 p-4 text-[15px] leading-snug";
  const btn = "relative mt-3 w-full rounded-xl bg-white/15 px-4 py-4 text-[17px] font-semibold active:bg-white/25";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 overflow-y-auto px-5 pt-[max(20px,env(safe-area-inset-top))] pb-16 text-white">
      <h1 className="text-[24px] font-semibold">Haptics test</h1>
      <p className="text-[14px] text-white/60">Tap each one and note which you feel. Silent mode off, System Haptics on (iPhone: Settings → Sounds &amp; Haptics).</p>

      <section className={card}>
        <b>A. A native switch</b> — does this phone tick for a switch at all?
        <label className="mt-3 flex items-center gap-3">
          {/* @ts-expect-error -- `switch` is Safari's attribute for a toggle switch, not in React's types */}
          <input type="checkbox" switch="" className="size-6" onChange={(e) => say(`A: switch ${e.target.checked ? "on" : "off"}`)} />
          Toggle me
        </label>
      </section>

      <section className={card}>
        <b>B. An invisible switch over a button</b>, tapped directly
        <div className={btn}>
          Tap me (B)
          {/* @ts-expect-error -- see A */}
          <input type="checkbox" switch="" aria-hidden tabIndex={-1} className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={() => (setCount((c) => ({ ...c, b: c.b + 1 })), say("B: overlay switch tapped"))} />
        </div>
        <p className="mt-1 text-[13px] text-white/50">taps: {count.b}</p>
      </section>

      <section className={card}>
        <b>C. A button that clicks a hidden switch from script</b> (the older trick)
        <button type="button" className={btn} onClick={() => (hiddenLabel.current?.click(), say("C: hidden label clicked from script"))}>
          Tap me (C)
        </button>
        <label ref={hiddenLabel} className="hidden">
          {/* @ts-expect-error -- see A */}
          <input type="checkbox" switch="" tabIndex={-1} />
        </label>
      </section>

      <section className={card}>
        <b>D. navigator.vibrate on a tap</b> (Android)
        <div className="grid grid-cols-3 gap-2">
          {[8, 15, 30].map((ms) => (
            <button key={ms} type="button" className={btn} onClick={() => say(`D: vibrate(${ms}) → ${typeof navigator.vibrate === "function" ? String(navigator.vibrate(ms)) : "no API"}`)}>
              {ms} ms
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <b>E. navigator.vibrate while dragging</b> — drag a finger along the strip; a tick every 40 px (how the song wheel would feel on Android)
        <div ref={strip} className="mt-3 flex h-20 touch-none items-center justify-center rounded-xl bg-white/15 text-white/70 select-none">⟵ drag here ⟶</div>
        <p className="mt-1 text-[13px] text-white/50">ticks sent: {count.e}</p>
      </section>

      <section className={card}>
        <b>Log</b>
        <pre className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap text-white/70">{log.join("\n") || "—"}</pre>
        <b className="mt-3 block">This browser</b>
        <pre className="mt-1 text-[11px] whitespace-pre-wrap text-white/50">{env}</pre>
      </section>
    </main>
  );
}

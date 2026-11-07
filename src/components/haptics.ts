import { useEffect, useState } from "react";

/**
 * Haptics on touch screens, as far as a web page can (see the haptics test page, app/haptics-test, 2026-11-06). Android
 * browsers vibrate (Chrome and Samsung Internet; not Firefox, which dropped it), once the visitor has touched the page;
 * only the length of a pulse can be set, not its strength, so a longer pulse is how it's made to feel stronger.
 * iPhones have no vibrate at all: the one tick a page can give is the native switch control's own, at a strength the
 * system sets. A finger tapping a switch always ticks, so tappable things carry an invisible one (icon.tsx SwitchTick);
 * a song passing the middle clicks a hidden switch from script instead (scriptTick), which ticks on iOS 17.4 to 26.4
 * only: from 26.5 WebKit ticks only for a real tap (a trusted event), so nothing on an iPhone can tick while scrolling.
 */

/** How long each kind of pulse is, ms: a tap on a control or a song; a song passing the middle as the wheel is turned by hand. */
const PULSE = { tap: 35, step: 20 } as const;
export type Haptic = keyof typeof PULSE;

/** Songs passing faster than this (a flick) tick no closer together than this, ms, so the wheel never just buzzes. */
const STEP_GAP = 50;
let lastStep = 0;

/** A pulse, where the browser can: Android vibrates; an iPhone ticks for a step (a tap ticks from its SwitchTick). */
export function haptic(kind: Haptic) {
  if (typeof navigator === "undefined") return;
  if (kind === "step") {
    const now = performance.now();
    if (now - lastStep < STEP_GAP) return;
    lastStep = now;
  }
  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(PULSE[kind]);
    } catch {
      // Not allowed here (no touch on the page yet): no pulse.
    }
  } else if (kind === "step" && switchTicks()) scriptTick();
}

/** A hidden switch, clicked from script and gone again: its tick on iOS 17.4 to 26.4; silent from 26.5 and elsewhere. */
function scriptTick() {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

let switches: boolean | null = null;
/** A finger is the pointer, the browser has the switch control and no vibrate: an iPhone (Safari 17.4 on). */
export const switchTicks = () =>
  (switches ??=
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && "switch" in HTMLInputElement.prototype && typeof navigator.vibrate !== "function");

/** Whether tappable things should carry a SwitchTick (known only in the browser: false until mounted). */
export function useSwitchTicks() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- known only in the browser
    setOn(switchTicks());
  }, []);
  return on;
}

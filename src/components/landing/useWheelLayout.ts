"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { barChromeOf, type SearchBarLook } from "./settings";
import { centreFloor, wheelGeometry, type WheelSettings } from "./wheel";

export type WheelLayout = ReturnType<typeof useWheelLayout>;

/**
 * The landing wheel's measurements for this window: the window itself, the titles' widths at 100 px in the serif
 * typeface (measured again on resizing, once the face has loaded, and when it's switched: `fontKey`), and from them the
 * wheel's geometry (wheelGeometry). Its centre text size sizes every icon on the site (iconBox), so the song pages use
 * this too. `ready` once measured in the loaded face.
 */
export function useWheelLayout(titles: string[], fontKey: string | undefined, settings: WheelSettings, look: SearchBarLook) {
  const [view, setView] = useState({ w: 0, h: 0, font: "", loads: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement("span");
    probe.className = "font-serif";
    document.body.append(probe);
    const font = getComputedStyle(probe).fontFamily;
    probe.remove();
    const measure = () => setView((v) => ({ ...v, w: window.innerWidth, h: window.innerHeight, font }));
    measure();
    // Measure again once the typeface has loaded (until then the fallback's widths would be measured).
    void document.fonts
      .load(`400 100px ${font}`)
      .catch(() => [])
      .then(() => setView((v) => ({ ...v, loads: v.loads + 1 })));
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fontKey]);
  const widthsAt100 = useMemo(() => {
    if (!view.font) return titles.map(() => 1000);
    const g = document.createElement("canvas").getContext("2d")!;
    g.font = `400 100px ${view.font}`;
    return titles.map((t) => g.measureText(t).width);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure once the typeface has loaded
  }, [titles, view.font, view.loads]);
  const size = view.w ? view : { w: 1440, h: 900 };
  const compact = size.w < 640;
  const bar = barChromeOf(look, compact);
  const geo = wheelGeometry(settings, size, Math.max(...widthsAt100), bar.em, bar.px, centreFloor(size));
  return { view, widthsAt100, compact, geo, ready: view.w > 0 && view.loads > 0 };
}

/** Text that stays readable on whatever is behind it (WCAG contrast). */

export type RGB = [number, number, number];

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
function luminance([r, g, b]: RGB) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two colours, 1–21. */
export function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const MUTED = 0x77;
const hexGrey = (g: number) => `#${g.toString(16).padStart(2, "0").repeat(3)}`;

/**
 * A muted grey label (the song page's artist, #777) on `bg`: its own grey wherever that reads (`ratio`: 3.5, past
 * WCAG's 3 for large text), else the nearest grey, lighter or darker, that does; on a background where none does, white
 * or black, whichever reads better.
 */
export function mutedOn(bg: RGB, ratio = 3.5): string {
  const reads = (g: number) => contrast([g, g, g], bg) >= ratio;
  if (reads(MUTED)) return hexGrey(MUTED);
  let up = MUTED;
  while (up < 255 && !reads(up)) up++;
  let down = MUTED;
  while (down > 0 && !reads(down)) down--;
  const [okUp, okDown] = [reads(up), reads(down)];
  if (okUp && okDown) return hexGrey(up - MUTED <= MUTED - down ? up : down);
  if (okUp || okDown) return hexGrey(okUp ? up : down);
  return contrast([255, 255, 255], bg) >= contrast([0, 0, 0], bg) ? "#ffffff" : "#000000";
}

/**
 * The open card grows out of its tile and shrinks back into it (a FLIP): it's laid out where it ends up, then drawn
 * with the transform that puts it over the tile, and that transform eases away. Pure, so it's tested in Node.
 */

export type Box = { left: number; top: number; width: number; height: number };
export type Flip = { x: number; y: number; sx: number; sy: number };

/** The transform (origin top left) that draws a box laid out at `to` exactly over `from`. */
export function flip(from: Box, to: Box): Flip {
  return { x: from.left - to.left, y: from.top - to.top, sx: from.width / to.width, sy: from.height / to.height };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const s = clamp01((v - a) / (b - a));
  return s * s * (3 - 2 * s);
};

/**
 * Everything drawn at progress `p` (0 = on the tile, 1 = open; a spring may overshoot either end):
 * - x, y, sx, sy: the card's transform;
 * - rx, ry: its corner radii before that scale, so the corners look `radius` round however it's stretched;
 * - ix, iy: the counter-scale that keeps the tile's face at its own size, unstretched;
 * - cx, cy: the open card's own content, zooming up with the card evenly (never stretched, never wider than it);
 * - face: the tile's own face, fading out early; content: the open card's, fading in late;
 * - overlay: the dimmed, blurred page behind it.
 */
export function morphFrame(p: number, f: Flip, radius: number) {
  const sx = f.sx + (1 - f.sx) * p;
  const sy = f.sy + (1 - f.sy) * p;
  const even = Math.min(sx, sy);
  return {
    x: f.x * (1 - p),
    y: f.y * (1 - p),
    sx,
    sy,
    rx: radius / sx,
    ry: radius / sy,
    ix: 1 / sx,
    iy: 1 / sy,
    cx: even / sx,
    cy: even / sy,
    face: 1 - smooth(0.05, 0.4, p),
    content: smooth(0.3, 0.85, p),
    overlay: clamp01(p),
  };
}

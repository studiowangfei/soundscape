/**
 * Blurring on a 2D canvas in every browser. Chrome and Firefox blur with the canvas's `filter`; Safari's canvas ignores
 * it (setting it does nothing), so there a picture is drawn small, box-blurred here, and scaled back up. The pixel
 * blur is pure, so it's tested in Node.
 */

let filterWorks: boolean | undefined;

/** Whether this browser's canvas blurs with `filter`: checked once, by blurring a dot and looking beside it. */
export function canvasFilterWorks(): boolean {
  if (filterWorks === undefined) {
    const c = Object.assign(document.createElement("canvas"), { width: 16, height: 16 });
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.filter = "blur(2px)";
    g.fillStyle = "#fff";
    g.fillRect(7, 7, 2, 2);
    filterWorks = g.getImageData(4, 8, 1, 1).data[3] > 0;
  }
  return filterWorks;
}

/**
 * Blurs RGBA pixels in place by about `r` px (three box passes each way, close to a Gaussian), transparent past the
 * edges. Colours are blurred premultiplied, so a colour fading into transparency keeps its hue (no dark fringe).
 */
export function boxBlur(data: Uint8ClampedArray, w: number, h: number, r: number) {
  const k = Math.max(1, Math.round(r));
  const n = w * h;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) ch[c][i] = data[i * 4 + c] * a;
    ch[3][i] = data[i * 4 + 3];
  }
  const tmp = new Float32Array(Math.max(w, h));
  // One box pass along a row or column: `len` values from `start`, `stride` apart.
  const pass = (v: Float32Array, start: number, stride: number, len: number) => {
    let sum = 0;
    for (let j = 0; j < Math.min(k, len); j++) sum += v[start + j * stride];
    for (let j = 0; j < len; j++) {
      if (j + k < len) sum += v[start + (j + k) * stride];
      if (j - k - 1 >= 0) sum -= v[start + (j - k - 1) * stride];
      tmp[j] = sum / (2 * k + 1);
    }
    for (let j = 0; j < len; j++) v[start + j * stride] = tmp[j];
  };
  for (const v of ch) {
    for (let p = 0; p < 3; p++) {
      for (let y = 0; y < h; y++) pass(v, y * w, 1, w);
      for (let x = 0; x < w; x++) pass(v, x, w, h);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = ch[3][i];
    data[i * 4 + 3] = a;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = a > 0 ? ch[c][i] / (a / 255) : 0;
  }
}

/**
 * Draws `src` (its `s` box) into `ctx` at the `d` box, blurred by `r` px, as `ctx.filter = "blur(r px)"` would: with
 * the filter where it works; else drawn small (about r/4 px a pixel, with room round it for the blur to spread into),
 * box-blurred and scaled back up smoothly.
 */
export function drawBlurred(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  s: { x: number; y: number; w: number; h: number },
  d: { x: number; y: number; w: number; h: number },
  r: number,
) {
  if (canvasFilterWorks()) {
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(src, s.x, s.y, s.w, s.h, d.x, d.y, d.w, d.h);
    ctx.filter = "none";
    return;
  }
  const k = Math.max(1, r / 4);
  const m = 2 * r;
  const W = Math.max(1, Math.ceil((d.w + 2 * m) / k));
  const H = Math.max(1, Math.ceil((d.h + 2 * m) / k));
  const small = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = small.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, s.x, s.y, s.w, s.h, m / k, m / k, d.w / k, d.h / k);
  const img = g.getImageData(0, 0, W, H);
  boxBlur(img.data, W, H, r / k);
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, d.x - m, d.y - m, W * k, H * k);
  ctx.restore();
}

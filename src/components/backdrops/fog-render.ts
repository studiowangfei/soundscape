/**
 * Pixel renderer for the Fog backdrop: the cover behind a pane fogged with condensation. No DOM, so the offline
 * preview (tools/scraper/fog-mock.mts) renders exactly what the app draws. Modelled on photos of fogged glass:
 *  - mist: microdroplets scatter light, so the scene reads heavily blurred, lifted and low in contrast, with bright
 *    areas blooming; it takes the scene's own colours (no grey overlay);
 *  - droplets: each is a tiny lens showing a sharp, inverted, wider view of the scene, with a dark refracting rim, a
 *    specular highlight up top and a faint caustic glint at the bottom; many tiny, fewer medium, a few large and
 *    irregular;
 *  - drip trails: streaks where a drop ran down and cleared the mist, ending in a large drop.
 * Droplets and trails are seeded and laid out in normalised coordinates, so tuning never reshuffles them. Each pane
 * of glass has its own seed (FogParams.seed): every song page its song's, the landing page its one window.
 */

export type FogParams = {
  /** Mist thickness (scattering: flatter contrast, lifted darks), 0–1. */
  density: number;
  /** How much the mist hides the scene: blends it towards a milky haze in the scene's own colours, 0–1. */
  opacity: number;
  /** Mist blur in CSS px. */
  blur: number;
  /** Glow of bright areas through the mist, 0–1. */
  bloom: number;
  /** Droplet count multiplier. */
  drops: number;
  /** Droplet size multiplier. */
  dropSize: number;
  /** How much wider than itself each droplet sees (and inverts). */
  refraction: number;
  /** Number of drip trails. */
  trails: number;
  /** How uneven the mist is (thicker and thinner patches, faint run streaks), 0–1. */
  patchiness: number;
  /** Overall brightness (the page's dimming), 0–1. */
  brightness: number;
  /** Which pane of glass: the seed for where its droplets and trails fall (same seed, same pane). Default WINDOW_SEED. */
  seed?: number;
};

type Img = Uint8ClampedArray | Uint8Array;

/** The Mist blur on a phone, as a share of the setting (which is a desktop's, in CSS px). */
export const PHONE_MIST_BLUR = 0.5;

/** The Mist blur setting (CSS px) as drawn on this device: half on a phone. */
export const mistBlur = (blur: number, phone: boolean) => blur * (phone ? PHONE_MIST_BLUR : 1);

/** Seeded PRNG (Park–Miller), so layouts are identical every render. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** The landing page's one window: the seed every pane had before each song got its own glass. */
export const WINDOW_SEED = 1234567;

/** A name's FNV-1a hash, in rng()'s range (1 to 2³¹ − 2). */
function hashSeed(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return 1 + ((h >>> 0) % 2147483646);
}

// How many large droplets (the ones that catch the eye) a song's glass may have at the default settings (1× droplets,
// 10 trails): the middle of what seeds give (22 to 46 over 200 songs, median 32), so no pane looks sparse or crowded.
const LARGE = { r: 0.008, min: 28, max: 36 };

/**
 * A song's own glass: a seed from its name, the same on every visit. A seed whose pane would have unusually few or
 * many large droplets is passed over for the name's next one (about 7 in 10 pass), so every song's glass is as busy.
 */
export function glassSeed(name: string): number {
  for (let k = 0; k < 20; k++) {
    const seed = hashSeed(k ? `${name}#${k}` : name);
    // Counted once those touching bigger ones are taken off (apart). Only droplets at least as big as the smallest
    // large one need looking at: one only ever goes for touching a bigger one.
    const { list } = placeDrops(1, 10, seed);
    const reach = (d: Drop) => d.r * (1 + d.wob * 1.5);
    const least = Math.min(...list.filter((d) => d.r >= LARGE.r).map(reach));
    const large = apart(list.filter((d) => reach(d) >= least)).filter((d) => d.r >= LARGE.r).length;
    if (large >= LARGE.min && large <= LARGE.max) return seed;
  }
  return hashSeed(name); // not in practice
}

/** Smooth 2D value noise in [0, 1], seeded by the integer lattice. */
function valueNoise(x: number, y: number) {
  const h = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Gaussian blur approximated by three box blurs, on a float RGB buffer (w×h), in place. */
function blurRGB(buf: Float32Array, w: number, h: number, sigma: number) {
  if (sigma < 0.5) return;
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii = [0, 1, 2].map((i) => ((i < m ? wl : wl + 2) - 1) / 2);
  const tmp = new Float32Array(buf.length);
  const pass = (from: Float32Array, to: Float32Array, r: number, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const step = horizontal ? 3 : w * 3;
    const norm = 1 / (2 * r + 1);
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * w * 3 : line * 3;
      for (let c = 0; c < 3; c++) {
        const at = (k: number) => from[base + Math.min(len - 1, Math.max(0, k)) * step + c];
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += at(k);
        for (let k = 0; k < len; k++) {
          to[base + k * step + c] = acc * norm;
          acc += at(k + r + 1) - at(k - r);
        }
      }
    }
  };
  for (const r of radii) {
    if (r < 1) continue;
    pass(buf, tmp, r, true);
    pass(tmp, buf, r, false);
  }
}

/** Downsamples RGBA (size²) by `f` into float RGB and blurs it, for sampleAt to read in full-size pixels. */
function blurredSampler(src: Img, size: number, sigma: number): Sampler {
  const f = Math.max(1, Math.min(8, Math.floor(sigma / 3)));
  const w = Math.ceil(size / f);
  const buf = new Float32Array(w * w * 3);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let yy = y * f; yy < Math.min(size, y * f + f); yy++) {
        for (let xx = x * f; xx < Math.min(size, x * f + f); xx++) {
          const i = (yy * size + xx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          cnt++;
        }
      }
      const o = (y * w + x) * 3;
      buf[o] = r / cnt;
      buf[o + 1] = g / cnt;
      buf[o + 2] = b / cnt;
    }
  }
  blurRGB(buf, w, w, sigma / f);
  return { buf, w, f };
}

type Sampler = { buf: Float32Array; w: number; f: number };

/** Samples a blurredSampler bilinearly at full-size pixel (x, y) into `out`. */
function sampleAt(s: Sampler, x: number, y: number, out: Float32Array) {
  const { buf, w, f } = s;
  const fx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / f - 0.5));
  const fy = Math.min(w - 1.001, Math.max(0, (y + 0.5) / f - 0.5));
  const x0 = fx | 0;
  const y0 = fy | 0;
  const ax = fx - x0;
  const ay = fy - y0;
  const i = (y0 * w + x0) * 3;
  const j = i + w * 3;
  for (let c = 0; c < 3; c++) {
    const top = buf[i + c] + (buf[i + 3 + c] - buf[i + c]) * ax;
    const bottom = buf[j + c] + (buf[j + 3 + c] - buf[j + c]) * ax;
    out[c] = top + (bottom - top) * ay;
  }
}

/** A pixel's grain, 0–1, the same for the same (x, y). Math.imul keeps it in 32-bit integers (the same values as a plain multiply here). */
function hash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The mist, pixel by pixel, into `fog`: the blurred scene with bloom from the wide blur, contrast pulled towards the
 * mean, a little lift, then the haze (`hide` of the way to `veil`); kept vivid, grained and streaked, thinner in patches.
 * A function of its own with its channels written out and every number passed in plain: inside renderFog, Safari's
 * engine stopped optimizing this loop after a few renders and it ran ~10× slower than in Chrome (over a second per
 * pane, which held up every change of cover).
 */
function mistPass(fog: Uint8ClampedArray, size: number, blurred: Sampler, wide: Sampler, mean: number, veil: number[], hide: number, d: number, b: number, bloom: number, pw: number, patchTab: Float32Array, streakTab: Float32Array) {
  const [v0, v1, v2] = veil;
  const A = new Float32Array(3);
  const B = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    const srow = (y >> 3) * size;
    const prow = (y >> 2) * pw;
    for (let x = 0; x < size; x++) {
      sampleAt(blurred, x, y, A);
      sampleAt(wide, x, y, B);
      // Fine microdroplet grain: the mist isn't perfectly smooth up close.
      const grain = (hash(x, y) - 0.5) * 10 * d;
      // Faint run streaks: noise stretched vertically.
      const streak = streakTab[srow + x];
      let r = A[0] + (Math.max(A[0], B[0] * 1.15) - A[0]) * bloom; // bloom: brights spread into darks
      let g = A[1] + (Math.max(A[1], B[1] * 1.15) - A[1]) * bloom;
      let u = A[2] + (Math.max(A[2], B[2] * 1.15) - A[2]) * bloom;
      r = r + (mean - r) * d * 0.25; // scattering flattens contrast
      g = g + (mean - g) * d * 0.25;
      u = u + (mean - u) * d * 0.25;
      r = r + (255 - r) * d * 0.08; // and lifts the blacks
      g = g + (255 - g) * d * 0.08;
      u = u + (255 - u) * d * 0.08;
      r = r + (v0 - r) * hide; // opacity: the scene disappears into the haze
      g = g + (v1 - g) * hide;
      u = u + (v2 - u) * hide;
      // Keep the colour vivid: light through fogged glass glows in the scene's own hues.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * u;
      const o = (y * size + x) * 4;
      fog[o] = ((luma + (r - luma) * 1.2) * (1 + streak) + grain) * b;
      fog[o + 1] = ((luma + (g - luma) * 1.2) * (1 + streak) + grain) * b;
      fog[o + 2] = ((luma + (u - luma) * 1.2) * (1 + streak) + grain) * b;
      // Patchy thickness: thinner mist shows more of the clear scene beneath.
      fog[o + 3] = 255 * patchTab[prow + (x >> 2)];
    }
  }
}

type Drop = { x: number; y: number; r: number; e: number; wob: number; ph: number };
type Trail = { x: number; y0: number; y1: number; w: number; amp: number; freq: number; ph: number };

/** A trail's centre at height y (normalised): nearly straight, with a slow drift and a little jitter. */
const trailX = (t: Trail, y: number) => t.x + Math.sin(y * t.freq + t.ph) * t.amp + Math.sin(y * t.freq * 3.7 + t.ph * 2) * t.amp * 0.3;

/** Droplets and trails in normalised units (radius as a fraction of the block size at dropSize 1). Don't modify it: it's shared. */
function layout(drops: number, trailCount: number, seed = WINDOW_SEED) {
  const key = `${drops} ${trailCount} ${seed}`;
  if (lastLayout?.key !== key) lastLayout = { key, value: makeLayout(drops, trailCount, seed) };
  return lastLayout.value;
}
let lastLayout: { key: string; value: ReturnType<typeof makeLayout> } | null = null;

function makeLayout(drops: number, trailCount: number, seed: number) {
  const { list, trails } = placeDrops(drops, trailCount, seed);
  const kept = apart(list);
  return { drops: kept, trails, bySize: [...kept].sort((a, c) => a.r - c.r) };
}

/** Droplets and trails as the seed places them, before those touching others are taken off (apart). */
function placeDrops(drops: number, trailCount: number, seed: number) {
  const rand = rng(seed);
  const trails: Trail[] = [];
  for (let i = 0; i < 30; i++) {
    const y0 = rand() * 0.7;
    trails.push({ x: rand(), y0, y1: Math.min(1, y0 + 0.15 + rand() * 0.4), w: 0.006 + rand() * 0.008, amp: 0.0008 + rand() * 0.0014, freq: 6 + rand() * 8, ph: rand() * 6.3 });
  }
  const activeTrails = trails.slice(0, Math.round(trailCount));
  const inTrail = (x: number, y: number) => activeTrails.some((t) => y > t.y0 && y < t.y1 && Math.abs(x - trailX(t, y)) < t.w * 1.4);

  const list: Drop[] = [];
  const big: Drop[] = [];
  // Size classes: [count at drops = 1, min radius, max radius] — many tiny, a few large.
  const classes: [number, number, number][] = [
    [9000, 0.0005, 0.0013],
    [1800, 0.0013, 0.0035],
    [320, 0.0035, 0.008],
    [40, 0.008, 0.018],
  ];
  for (const [count, rMin, rMax] of classes) {
    const n = Math.round(count * drops);
    for (let i = 0; i < n; i++) {
      const r = rMin + (rMax - rMin) * rand() ** 1.6;
      const x = rand();
      // Bigger drops sit a little lower: they grow by merging and start to slide.
      const y = r > 0.004 ? Math.min(1, rand() ** 0.8) : rand();
      const d: Drop = { x, y, r, e: 1 + rand() * (r > 0.004 ? 0.3 : 0.12), wob: r > 0.006 ? 0.03 + rand() * 0.05 : 0, ph: rand() * 6.3 };
      // Trails were wiped clean by the running drop, leaving only a few beads behind.
      if (inTrail(x, y) && rand() < (r > 0.0013 ? 0.9 : 0.6)) continue;
      if (r > 0.003 && big.some((b) => Math.hypot(b.x - x, b.y - y) < (b.r + r) * 1.15)) continue;
      if (r > 0.003) big.push(d);
      list.push(d);
    }
  }
  // Each trail ends in the drop that made it, and is beaded with the little drops it left behind.
  for (const t of activeTrails) {
    list.push({ x: trailX(t, t.y1), y: t.y1, r: t.w * 1.3, e: 1.2, wob: 0.05, ph: t.x * 40 });
    const beads = Math.round((t.y1 - t.y0) / 0.022);
    for (let i = 0; i < beads; i++) {
      const y = t.y0 + (t.y1 - t.y0) * rand() * 0.95;
      list.push({ x: trailX(t, y) + (rand() - 0.5) * t.w, y, r: t.w * (0.2 + rand() * 0.45), e: 1 + rand() * 0.3, wob: 0, ph: 0 });
    }
  }
  return { list, trails: activeTrails };
}

/**
 * How close two droplets may come: their drawn extents (wobble and elongation included, as fogDrops gives them) summed
 * along each axis, times this. Two that touched would have run together into one.
 */
export const DROP_GAP = 1.1;

/** Whether two droplets (centre, drawn radii, in the same units) come closer than DROP_GAP allows. */
export function dropsTouch(a: { x: number; y: number; rx: number; ry: number }, b: { x: number; y: number; rx: number; ry: number }) {
  const u = (a.x - b.x) / (a.rx + b.rx);
  const v = (a.y - b.y) / (a.ry + b.ry);
  return u * u + v * v < DROP_GAP * DROP_GAP;
}

/**
 * The droplets with none touching another (dropsTouch): biggest first, each kept unless it touches one already kept,
 * in their placed order. (Placed at random, small ones fell on the edges of big ones and on each other.)
 */
function apart(list: Drop[]): Drop[] {
  const ext = list.map((d) => {
    const rx = d.r * (1 + d.wob * 1.5);
    return { x: d.x, y: d.y, rx, ry: rx * d.e };
  });
  const order = list.map((_, i) => i).sort((a, b) => ext[b].rx - ext[a].rx || a - b);
  // A grid over the pane: each kept droplet listed in every cell its box covers, so one it touches shares a cell.
  const CELL = 0.02;
  const n = Math.ceil(1 / CELL) + 2;
  const cell = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v / CELL) + 1));
  const grid: number[][] = Array.from({ length: n * n }, () => []);
  const keep = new Uint8Array(list.length);
  for (const i of order) {
    const e = ext[i];
    const [x0, x1, y0, y1] = [cell(e.x - e.rx), cell(e.x + e.rx), cell(e.y - e.ry), cell(e.y + e.ry)];
    let touches = false;
    for (let cy = y0; cy <= y1 && !touches; cy++) for (let cx = x0; cx <= x1 && !touches; cx++) touches = grid[cy * n + cx].some((j) => dropsTouch(e, ext[j]));
    if (touches) continue;
    keep[i] = 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) grid[cy * n + cx].push(i);
  }
  return list.filter((_, i) => keep[i]);
}

/**
 * The mist's slow-varying noise, tabulated coarsely: patchy thickness every 4 px, run streaks per column every 8 rows.
 * The same for every cover, so the last few are kept.
 */
function mistNoise(size: number, patchiness: number, opacity: number) {
  const key = `${size} ${patchiness} ${opacity}`;
  const hit = noiseTabs.get(key);
  if (hit) return hit;
  const pw = Math.ceil(size / 4);
  const patchTab = new Float32Array(pw * pw);
  for (let j = 0; j < pw; j++) {
    for (let i = 0; i < pw; i++) {
      const nx = (i * 4) / size;
      const ny = (j * 4) / size;
      const n = valueNoise(nx * 5 + 3.1, ny * 5) * 0.65 + valueNoise(nx * 13, ny * 13 + 7.7) * 0.35;
      patchTab[j * pw + i] = 1 - patchiness * 0.45 * (1 - opacity) * Math.max(0, n - 0.35) / 0.65; // opaque mist has no thin spots
    }
  }
  const sh = Math.ceil(size / 8);
  const streakTab = new Float32Array(size * sh);
  for (let j = 0; j < sh; j++) {
    for (let x = 0; x < size; x++) streakTab[j * size + x] = (valueNoise((x / size) * 90, ((j * 8) / size) * 4) - 0.5) * 0.14 * patchiness;
  }
  const tabs = { pw, patchTab, streakTab };
  noiseTabs.set(key, tabs);
  if (noiseTabs.size > 4) noiseTabs.delete(noiseTabs.keys().next().value!);
  return tabs;
}
const noiseTabs = new Map<string, { pw: number; patchTab: Float32Array; streakTab: Float32Array }>();

/** The scene's mean brightness, and the haze an opaque mist converges to: its average colour, lightened (light scattered many times). */
function sceneVeil(src: Img, size: number) {
  let mean = 0;
  const meanRGB = [0, 0, 0];
  for (let i = 0; i < size * size * 4; i += 16) {
    mean += (src[i] + src[i + 1] + src[i + 2]) / 3;
    for (let c = 0; c < 3; c++) meanRGB[c] += src[i + c];
  }
  mean /= (size * size) / 4;
  const veil = meanRGB.map((v) => {
    const m = v / ((size * size) / 4);
    return m + (255 - m) * 0.35;
  });
  return { mean, veil };
}

/** A droplet's centre and radii in fog px, and the wobble of its outline (see layout()). */
export type DropShape = { cx: number; cy: number; rx: number; ry: number; wob: number; ph: number };

/**
 * How a droplet looks, shared by renderFog and the drops that run down the glass on their own (so a running drop is
 * the very droplet that was there, not a lookalike). Returns paint(drop, hide, out, ow, oh, ox, oy, over), which draws
 * into `out` (RGBA, ow×oh, its top-left at (ox, oy)): composited over what's there when `over`, else as a
 * straight-alpha sprite on a clear buffer. `hide` is how far the mist hides the scene (opacity × 0.92).
 *
 * `k` is the droplets' px per fog px: the drop, `out` and its place are in those px, so a droplet can be drawn sharper
 * than the fog it's on (the screen's own px, where the mist, soft anyway, is rendered coarser). Only its edge gets
 * finer: what it shows, and its size class (lens or speck, highlight, caustic), go by its size in fog px. `under` (the
 * mist behind, for the tiniest) is in fog px.
 */
export function dropPainter(src: Img, size: number, p: Pick<FogParams, "refraction" | "brightness">, k = 1) {
  const { veil } = sceneVeil(src, size);
  const b = p.brightness;
  const sampleClear = (x: number, y: number, c: number) => {
    const fx = Math.min(size - 1.001, Math.max(0, x));
    const fy = Math.min(size - 1.001, Math.max(0, y));
    const x0 = fx | 0;
    const y0 = fy | 0;
    const ax = fx - x0;
    const ay = fy - y0;
    const i = (y0 * size + x0) * 4 + c;
    const j = i + size * 4;
    const top = src[i] + (src[i + 4] - src[i]) * ax;
    const bottom = src[j] + (src[j + 4] - src[j]) * ax;
    return top + (bottom - top) * ay;
  };
  return (dr: DropShape, hide: number, out: Uint8ClampedArray, ow: number, oh: number, ox: number, oy: number, over: boolean, under?: Img) => {
    const { cx, cy, rx, ry, wob, ph } = dr;
    const rf = rx / k; // its radius in fog px
    const pad = 1 + rx * wob;
    for (let y = Math.max(oy, Math.floor(cy - ry - pad)); y < Math.min(oy + oh, Math.ceil(cy + ry + pad)); y++) {
      for (let x = Math.max(ox, Math.floor(cx - rx - pad)); x < Math.min(ox + ow, Math.ceil(cx + rx + pad)); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        let rho = Math.hypot(u, v);
        if (wob) rho /= 1 + wob * Math.sin(2 * Math.atan2(v, u) + ph) + wob * 0.5 * Math.sin(3 * Math.atan2(v, u) + ph * 2);
        const cover = Math.min(1, Math.max(0, (1 - rho) * rx + 0.5)); // anti-aliased edge
        if (cover <= 0) continue;
        const o = ((y - oy) * ow + (x - ox)) * 4;
        const view = p.refraction * (1 + 0.5 * rho * rho); // edges bend harder
        // Rim darkening (strongest at the bottom, light comes from above), highlight top-left, caustic at the bottom.
        // A speck drawn finer than its fog px would show its rim as a ring and its highlight as a dot: it gets the
        // rim and highlight it has on average over its disc instead, a darker dot as it looks a fog px wide.
        const flat = k > 1 && rf <= LENS_PX;
        const rim = flat ? SPECK_RIM : Math.min(1, Math.max(0, (rho - 0.55) / 0.45)) ** 1.5 * (0.55 + 0.25 * Math.max(0, v));
        const spec = flat ? SPECK_SPEC : Math.exp(-((u + 0.32) ** 2 + (v + 0.42) ** 2) / 0.03) * (rf > 1.5 ? 0.85 : 0.35);
        const caustic = rf > 2.5 ? Math.exp(-(u ** 2 + (v - 0.55) ** 2) / 0.09) * 0.22 : 0;
        const a = cover;
        const ma = over ? out[o + 3] / 255 : 0;
        const outA = a + ma * (1 - a);
        const uo = (Math.min(size - 1, ((y + 0.5) / k) | 0) * size + Math.min(size - 1, ((x + 0.5) / k) | 0)) * 4; // `under` here
        for (let c = 0; c < 3; c++) {
          // Inverted, wider view of the clear scene. Tiny drops are too small to show an image: a darker speck of the
          // mist behind (`under`, when drawing on a layer of droplets over it) with a hint of the sharper scene, which
          // is what gives fog its texture up close.
          const behind = ma > 0 || !under ? (over ? out[o + c] : 0) : under[uo + c];
          const seen = rf > LENS_PX ? sampleClear((cx - (x + 0.5 - cx) * view) / k, (cy - (y + 0.5 - cy) * view) / k, c) * 1.08 : (behind / Math.max(0.01, b)) * 0.62 + sampleClear(cx / k, cy / k, c) * 0.3;
          const hazy = seen + (veil[c] - seen) * hide * 0.5; // drops on opaque mist see through the haze too
          const col = (hazy * (1 - rim) + 255 * (spec + caustic)) * b;
          out[o + c] = over ? (col * a + out[o + c] * ma * (1 - a)) / Math.max(0.001, outA) : col;
        }
        out[o + 3] = outA * 255;
      }
    }
  };
}

/** Droplets wider than this (radius, px) are lenses, showing an image of the scene; smaller ones are specks of mist. */
export const LENS_PX = 1.5;

/** A speck's rim darkening and highlight averaged over its disc (dropPainter's, for a speck drawn finer than fog px). */
const SPECK_RIM = 0.1946;
const SPECK_SPEC = 0.0105;

/** Droplets smaller than this (the first size class) read as the mist's texture rather than as droplets. */
export const TEXTURE_DROP = 0.0013;

/**
 * Where on the pane the droplets are drawn, and how finely: `k` px per fog px, over the fog px from (x, y), w × h (the
 * part of the pane the window shows: the droplets are on the glass and stay put, so the rest is never seen).
 */
export type LensView = { k: number; x: number; y: number; w: number; h: number };

/**
 * Renders the fog (RGBA with alpha: mist, trails, droplets) in two parts, `scene` (the mist, which shows the scene and so
 * moves with it) and `lenses` (every droplet, the tiniest too, which are on the glass and stay put; fogOf puts them
 * together), plus the tiniest droplets alone (`specks`, the mist's texture, which a running drop's trail fogs back
 * with) and the clear view beneath (RGBA), all `size`×`size`, from the cover sampled at that size. `scale` is render px per CSS px (for
 * the blur radius). With `view`, `lenses` is drawn sharper over part of the pane: (w·k) × (h·k), its top-left at fog px
 * (x, y) (lensBox); the specks stay in fog px.
 */
export function renderFog(src: Img, size: number, scale: number, p: FogParams, view?: LensView) {
  const fog = new Uint8ClampedArray(size * size * 4);
  const clear = new Uint8ClampedArray(size * size * 4);
  const b = p.brightness;
  const d = p.density;

  for (let i = 0; i < size * size * 4; i += 4) {
    clear[i] = src[i] * b;
    clear[i + 1] = src[i + 1] * b;
    clear[i + 2] = src[i + 2] * b;
    clear[i + 3] = 255;
  }

  // Mist: blurred scene, bloom from a much wider blur, contrast pulled towards the mean, a little lift.
  const blurred = blurredSampler(src, size, p.blur * scale);
  const wide = blurredSampler(src, size, p.blur * scale * 3.5);
  const { mean, veil } = sceneVeil(src, size);
  const hide = p.opacity * 0.92;
  const { trails, bySize } = layout(p.drops, p.trails, p.seed);
  const { pw, patchTab, streakTab } = mistNoise(size, p.patchiness, p.opacity);
  mistPass(fog, size, blurred, wide, mean, veil, hide, d, b, p.bloom, pw, patchTab, streakTab);

  // Drip trails: the mist cleared (mostly) along a wavering path that tapers at the top.
  for (const t of trails) {
    const ty0 = t.y0 * size;
    const ty1 = t.y1 * size;
    for (let y = Math.max(0, Math.floor(ty0)); y < Math.min(size, Math.ceil(ty1)); y++) {
      const ny = y / size;
      const along = (y - ty0) / Math.max(1, ty1 - ty0);
      const hw = t.w * size * (0.35 + 0.65 * Math.min(1, along * 3));
      const cx = trailX(t, ny) * size;
      for (let x = Math.max(0, Math.floor(cx - hw - 2)); x < Math.min(size, Math.ceil(cx + hw + 2)); x++) {
        const k = Math.abs(x - cx) / hw;
        if (k >= 1.15) continue;
        const film = 0.3 + 0.5 * p.opacity; // mist left in the middle: a thin film (thicker when the mist is opaque)
        const keep = film + (1 - film) * Math.min(1, Math.max(0, (k - 0.7) / 0.45));
        const o = (y * size + x) * 4 + 3;
        fog[o] = Math.min(fog[o], 255 * keep);
      }
    }
  }

  // Droplets, small to large, on a layer of their own, `lenses`: they're on the glass and stay put, while `scene` (the
  // mist, the scene seen through it) moves with the scene behind. The two together are the fog (fogOf). Each is a little
  // inverted lens onto the clear scene, the smallest a speck of the mist behind it. The tiniest are the mist's own
  // texture, so they're kept apart too (`specks`): a run's trail fogs back with them, but not with the rest.
  const S = size * p.dropSize;
  const paint = dropPainter(src, size, p);
  const box = lensBox(size, view);
  const k = box.k;
  // Drawn finer, the droplets go on a layer of their own, and the specks (in fog px) are painted again apart.
  const fine = k !== 1 || box.w !== size || box.h !== size ? dropPainter(src, size, p, k) : null;
  const lenses = new Uint8ClampedArray(box.w * box.h * 4);
  let specks: Uint8ClampedArray | null = fine ? new Uint8ClampedArray(size * size * 4) : null;
  for (const dr of bySize) {
    const rx = Math.max(0.5, dr.r * S);
    if (fine) {
      if (dr.r < TEXTURE_DROP) paint({ cx: dr.x * size, cy: dr.y * size, rx, ry: rx * dr.e, wob: dr.wob, ph: dr.ph }, hide, specks!, size, size, 0, 0, true, fog);
      fine({ cx: dr.x * size * k, cy: dr.y * size * k, rx: rx * k, ry: rx * dr.e * k, wob: dr.wob, ph: dr.ph }, hide, lenses, box.w, box.h, box.x, box.y, true, fog);
      continue;
    }
    if (!specks && dr.r >= TEXTURE_DROP) specks = lenses.slice();
    paint({ cx: dr.x * size, cy: dr.y * size, rx, ry: rx * dr.e, wob: dr.wob, ph: dr.ph }, hide, lenses, size, size, 0, 0, true, fog);
  }
  specks ??= lenses.slice();
  const done = (b: Uint8ClampedArray) => b as Uint8ClampedArray<ArrayBuffer>;
  return { scene: done(fog), lenses: done(lenses), specks: done(specks), clear: done(clear) };
}

/**
 * The droplet layer's own px (renderFog's `lenses`): `k` per fog px, the layer w × h of them, its top-left at (x, y) of
 * them. Without a view, the whole pane in fog px. The view's edges are rounded out to whole px of the layer.
 */
export function lensBox(size: number, view?: LensView): { k: number; x: number; y: number; w: number; h: number } {
  if (!view) return { k: 1, x: 0, y: 0, w: size, h: size };
  const k = view.k;
  const x0 = Math.max(0, Math.floor(Math.max(0, view.x) * k));
  const y0 = Math.max(0, Math.floor(Math.max(0, view.y) * k));
  const x1 = Math.min(Math.round(size * k), Math.ceil(Math.min(size, view.x + view.w) * k));
  const y1 = Math.min(Math.round(size * k), Math.ceil(Math.min(size, view.y + view.h) * k));
  return { k, x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** The whole fog as one image: the lenses laid over the scene layer (the page draws the two apart). */
export function fogOf(scene: Uint8ClampedArray, lenses: Uint8ClampedArray) {
  const fog = scene.slice();
  for (let i = 0; i < fog.length; i += 4) {
    const a = lenses[i + 3] / 255;
    if (!a) continue;
    const ma = fog[i + 3] / 255;
    const out = a + ma * (1 - a);
    for (let c = 0; c < 3; c++) fog[i + c] = (lenses[i + c] * a + fog[i + c] * ma * (1 - a)) / out;
    fog[i + 3] = out * 255;
  }
  return fog;
}

/** The same pane after more condensation: denser, more opaque, blurrier and more even mist, same droplets. `a` is 0–1. */
export function thickened(p: FogParams, a: number): FogParams {
  return { ...p, opacity: p.opacity + (1 - p.opacity) * a, density: p.density + (1 - p.density) * a, blur: p.blur * (1 + 0.5 * a), patchiness: p.patchiness * (1 - a) };
}

/**
 * Every droplet on the pane, for running drops: index in the layout, centre, body radius `rd` and the radii of all it
 * covers when drawn (`rx`, `ry`: wobble and elongation included), all as fractions of the rendered size; and whether
 * it is big enough to run.
 */
export function fogDrops(p: Pick<FogParams, "drops" | "trails" | "dropSize" | "seed">) {
  return layout(p.drops, p.trails, p.seed).drops.map((d, i) => {
    const rd = d.r * p.dropSize;
    const rx = rd * (1 + d.wob * 1.5);
    return { i, x: d.x, y: d.y, rd, rx, ry: rx * d.e, e: d.e, wob: d.wob, ph: d.ph, canRun: d.r >= 0.005 }; // only drops this big are heavy enough to run
  });
}

/**
 * Params for a pane `1/k` times larger on screen than a song page's (the landing page's full-screen layout): droplets
 * drawn k times smaller and 1/k² as many, so they look the same on screen.
 */
export function fillParams(p: FogParams, k: number): FogParams {
  return { ...p, dropSize: p.dropSize * k, drops: p.drops / (k * k) };
}

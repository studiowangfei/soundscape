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
    const large = makeLayout(1, 10, seed).drops.filter((d) => d.r >= LARGE.r).length;
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

/** Downsamples RGBA (size²) by `f` into float RGB, blurs it, and returns a bilinear sampler in full-size pixels. */
function blurredSampler(src: Img, size: number, sigma: number) {
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
  return (x: number, y: number, out: Float32Array) => {
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
  };
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
  return { drops: list, trails: activeTrails, bySize: [...list].sort((a, c) => a.r - c.r) };
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
 * into `out` (RGBA, ow×oh, its top-left at fog px (ox, oy)): composited over what's there when `over`, else as a
 * straight-alpha sprite on a clear buffer. `hide` is how far the mist hides the scene (opacity × 0.92).
 */
export function dropPainter(src: Img, size: number, p: Pick<FogParams, "refraction" | "brightness">) {
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
  return (dr: DropShape, hide: number, out: Uint8ClampedArray, ow: number, oh: number, ox: number, oy: number, over: boolean) => {
    const { cx, cy, rx, ry, wob, ph } = dr;
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
        const rim = Math.min(1, Math.max(0, (rho - 0.55) / 0.45)) ** 1.5 * (0.55 + 0.25 * Math.max(0, v));
        const spec = Math.exp(-((u + 0.32) ** 2 + (v + 0.42) ** 2) / 0.03) * (rx > 1.5 ? 0.85 : 0.35);
        const caustic = rx > 2.5 ? Math.exp(-(u ** 2 + (v - 0.55) ** 2) / 0.09) * 0.22 : 0;
        const a = cover;
        const ma = over ? out[o + 3] / 255 : 0;
        const outA = a + ma * (1 - a);
        for (let c = 0; c < 3; c++) {
          // Inverted, wider view of the clear scene. Tiny drops are too small to show an image: a darker speck of mist
          // with a hint of the sharper scene, which is what gives fog its texture up close.
          const seen =
            rx > 1.5
              ? sampleClear(cx - (x + 0.5 - cx) * view, cy - (y + 0.5 - cy) * view, c) * 1.08
              : (over ? (out[o + c] / Math.max(0.01, b)) * 0.62 : 0) + sampleClear(cx, cy, c) * 0.3;
          const hazy = seen + (veil[c] - seen) * hide * 0.5; // drops on opaque mist see through the haze too
          const col = (hazy * (1 - rim) + 255 * (spec + caustic)) * b;
          out[o + c] = over ? (col * a + out[o + c] * ma * (1 - a)) / Math.max(0.001, outA) : col;
        }
        out[o + 3] = outA * 255;
      }
    }
  };
}

/** Droplets smaller than this (the first size class) read as the mist's texture rather than as droplets. */
export const TEXTURE_DROP = 0.0013;

/**
 * Renders the fog layer (RGBA with alpha: mist, trails, droplets), the same with only the tiniest droplets (`mist`,
 * what a running drop's trail fogs back to) and the clear view beneath (RGBA), all `size`×`size`, from the cover sampled at that
 * size. `scale` is render px per CSS px (for the blur radius).
 */
export function renderFog(src: Img, size: number, scale: number, p: FogParams) {
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
  const A = new Float32Array(3);
  const B = new Float32Array(3);
  const hash = (x: number, y: number) => {
    let h = (x * 73856093) ^ (y * 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const { pw, patchTab, streakTab } = mistNoise(size, p.patchiness, p.opacity);
  const tone = [0, 0, 0]; // the mist's colour at a pixel
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      blurred(x, y, A);
      wide(x, y, B);
      // Fine microdroplet grain: the mist isn't perfectly smooth up close.
      const grain = (hash(x, y) - 0.5) * 10 * d;
      // Faint run streaks: noise stretched vertically.
      const streak = streakTab[(y >> 3) * size + x];
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        let v = A[c] + (Math.max(A[c], B[c] * 1.15) - A[c]) * p.bloom; // bloom: brights spread into darks
        v = v + (mean - v) * d * 0.25; // scattering flattens contrast
        v = v + (255 - v) * d * 0.08; // and lifts the blacks
        tone[c] = v + (veil[c] - v) * hide; // opacity: the scene disappears into the haze
      }
      // Keep the colour vivid: light through fogged glass glows in the scene's own hues.
      const luma = 0.2126 * tone[0] + 0.7152 * tone[1] + 0.0722 * tone[2];
      for (let c = 0; c < 3; c++) fog[o + c] = ((luma + (tone[c] - luma) * 1.2) * (1 + streak) + grain) * b;
      // Patchy thickness: thinner mist shows more of the clear scene beneath.
      fog[o + 3] = 255 * patchTab[(y >> 2) * pw + (x >> 2)];
    }
  }

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

  // Droplets, small to large: each a little inverted lens onto the clear scene. The tiniest are the mist's own texture,
  // so `mist` (what a run's trail fogs back to) keeps them and leaves out the rest.
  const S = size * p.dropSize;
  const paint = dropPainter(src, size, p);
  let mist: Uint8ClampedArray | null = null;
  for (const dr of bySize) {
    if (!mist && dr.r >= TEXTURE_DROP) mist = fog.slice();
    const rx = Math.max(0.5, dr.r * S);
    paint({ cx: dr.x * size, cy: dr.y * size, rx, ry: rx * dr.e, wob: dr.wob, ph: dr.ph }, hide, fog, size, size, 0, 0, true);
  }
  mist ??= fog.slice();
  return { fog: fog as Uint8ClampedArray<ArrayBuffer>, mist: mist as Uint8ClampedArray<ArrayBuffer>, clear: clear as Uint8ClampedArray<ArrayBuffer> };
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

// Makes the one-colour source marks the collapsed cards show (content/icons/<domain>.mono.png, drawn in the text's
// grey like the player's streaming icons): the Simple Icons mark (CC0) where it reads at 16 px, else derived from
// the site's own icon. An icon that fills its square (a solid tile) becomes a disc with its logo cut out: whatever
// differs from the tile's colour. Any other icon keeps its logo: everything that isn't white or clear. Only icons
// without a mark yet, unless --force.
// Re-run after fetch-icons adds a site (both: npm run icons).
// Run: npx tsx scripts/mono-icons.mts [--force] (in this workspace, from web/ with NODE_USE_ENV_PROXY=1)
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CONTENT_DIR } from "../src/content/load";

const ICONS = path.join(CONTENT_DIR, "icons");
const force = process.argv.includes("--force");
// Sites whose Simple Icons mark (its slug for each) is cleaner than anything derived from a favicon. (Simple Icons
// also draws The Guardian and Billboard, but as wordmarks too small to read here, and Genius as a stray-looking face:
// their tiles, cut out, read better.)
const SIMPLE_ICONS: Record<string, string> = {
  "youtube.com": "youtube",
  "wikipedia.org": "wikipedia",
  "letterboxd.com": "letterboxd",
  "douban.com": "douban",
};

/** The Simple Icons mark, rasterised black on clear at 128 px (the CSS mask reads its alpha). */
async function simpleIcon(slug: string): Promise<Buffer> {
  const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`simple-icons ${slug}: ${res.status}`);
  const svg = (await res.text()).replace(/<title>.*?<\/title>/, "");
  return sharp(Buffer.from(svg), { density: 600 }).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** The mark inside a favicon (see the top of this file). */
async function derived(file: string): Promise<Buffer> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const out = Buffer.alloc(w * h * 4);
  const rgb = (i: number) => [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  // A solid tile: all four corners opaque, in a colour (a white square is just the logo's background). Its colour is
  // the corners' on average.
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => p * 4);
  const bg = [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + rgb(i)[k], 0) / 4);
  const whiteBg = Math.min(...bg) > 0.85;
  const tile = !whiteBg && corners.every((i) => data[i + 3] > 200);
  const ink = (i: number) => {
    const [r, g, b] = rgb(i);
    const a = data[i + 3] / 255;
    // On a tile, ink is the tile's own colour: the logo, whatever its colour, is cut out of it.
    if (tile) return a * Math.min(1, Math.max(0, 1 - (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) - 0.15) / 0.3));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const white = Math.max(r, g, b) - Math.min(r, g, b) < 0.2 ? Math.min(1, Math.max(0, (lum - 0.62) / 0.3)) : 0;
    return a * (1 - white);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const disc = tile ? Math.min(1, Math.max(0, w / 2 - Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) + 0.5)) : 1;
      out[i] = out[i + 1] = out[i + 2] = 255;
      out[i + 3] = Math.round(255 * ink(i) * disc);
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const icons = (await fs.readdir(ICONS)).filter((f) => f.endsWith(".png") && !f.endsWith(".mono.png"));
for (const f of icons) {
  const domain = f.slice(0, -".png".length);
  const target = path.join(ICONS, `${domain}.mono.png`);
  if (!force && (await fs.stat(target).catch(() => null))) continue;
  const slug = SIMPLE_ICONS[domain];
  const png = slug ? await simpleIcon(slug) : await derived(path.join(ICONS, f));
  await fs.writeFile(target, png);
  console.log(`${domain}: ${slug ? `Simple Icons "${slug}"` : "derived from its icon"}`);
}

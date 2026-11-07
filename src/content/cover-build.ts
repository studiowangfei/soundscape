// Makes the two WebP sizes the site serves from one cover original: <slug>-1200.webp for phones and <slug>-2048.webp
// for everything wider. Never upscaled: an original under 2,048 px gives a "2048" file at its own size.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { COVER, type CoverSize } from "./cover-rules";

export interface BuiltCover {
  size: CoverSize;
  width: number;
  height: number;
  bytes: number;
}

export async function buildCoverWebps(original: string, outDir: string, slug: string): Promise<BuiltCover[]> {
  const input = await fs.readFile(original);
  const made: BuiltCover[] = [];
  for (const size of COVER.sizes) {
    const out = path.join(outDir, `${slug}-${size}.webp`);
    const info = await sharp(input)
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: COVER.webpQuality })
      .toFile(out);
    made.push({ size, width: info.width, height: info.height, bytes: info.size });
  }
  return made;
}

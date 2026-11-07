// Writes a song's cover original (content/covers/<slug>.jpg) by the content rule: longest side 1,200–2,048 px (bigger
// images scaled down to 2,048), JPEG quality 90, at most 2 MB. Used by `npm run cover` and the generator's export.
import fs from "node:fs/promises";
import sharp, { type OutputInfo } from "sharp";
import { COVER } from "./cover-rules";

/** `minPx` is the song's floor (minCoverPx): COVER.minPx except for the named small covers. */
export async function writeOriginal(input: Buffer, out: string, minPx: number = COVER.minPx): Promise<{ width: number; height: number; bytes: number }> {
  const img = sharp(input).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  if (Math.max(width, height) < minPx) throw new Error(`${width}×${height} is under ${minPx} px`);
  const sized = img.resize({ width: COVER.maxPx, height: COVER.maxPx, fit: "inside", withoutEnlargement: true }).flatten({ background: "#000" });
  // Quality 90, stepping down for a grainy cover that would be over 2 MB.
  let made: { data: Buffer; info: OutputInfo } | null = null;
  for (const quality of [COVER.jpegQuality, 85, 80]) {
    made = await sized.clone().jpeg({ quality }).toBuffer({ resolveWithObject: true });
    if (made.data.length <= COVER.maxBytes) break;
  }
  const { data, info } = made!;
  if (data.length > COVER.maxBytes) throw new Error(`${(data.length / 1024 / 1024).toFixed(1)} MB is over ${COVER.maxBytes / 1024 / 1024} MB even at quality 80`);
  await fs.writeFile(out, data);
  return { width: info.width, height: info.height, bytes: data.length };
}

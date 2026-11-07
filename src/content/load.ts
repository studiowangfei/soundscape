import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { COVER, minCoverPx } from "./cover-rules";
import { EntrySchema, type Entry } from "./schema";

// The songs: content/ inside the app (the deploy repo, see scripts/package-dist.mts), else beside it (this workspace).
export const CONTENT_DIR: string =
  process.env.SOUNDSCAPE_CONTENT_DIR ??
  [path.resolve(process.cwd(), "content"), path.resolve(process.cwd(), "..", "content")].find((d) => existsSync(d)) ??
  path.resolve(process.cwd(), "..", "content");

const MAX_IMAGE_BYTES = 250 * 1024;

/** What's wrong with a cover's original (see COVER), or null when it's fine. */
async function checkCover(file: string, rel: string, minPx: number): Promise<string | null> {
  let bytes: number;
  try {
    bytes = (await fs.stat(file)).size;
  } catch {
    return `cover file not found: ${rel}`;
  }
  if (bytes > COVER.maxBytes) return `cover ${rel} is ${(bytes / 1048576).toFixed(1)} MB, over the 2 MB limit`;
  // Loaded here, not at the top: the visitor-comment endpoint imports this module and never checks a cover.
  const { default: sharp } = await import("sharp");
  const { width, height } = await sharp(file)
    .metadata()
    .catch(() => ({ width: undefined, height: undefined }));
  if (!width || !height) return `cover ${rel} isn't a readable image`;
  if (Math.max(width, height) < minPx) return `cover ${rel} is ${width}×${height}, under ${minPx} px on its longest side`;
  return null;
}

export type ContentError = { file: string; message: string };

export async function checkEntries(
  dir: string = CONTENT_DIR,
): Promise<{ entries: Entry[]; errors: ContentError[] }> {
  const errors: ContentError[] = [];
  const entries: Entry[] = [];
  const files: string[] = [];
  try {
    files.push(
      ...(await fs.readdir(path.join(dir, "songs"))).filter((f) => f.endsWith(".json")).sort(),
    );
  } catch (e) {
    errors.push({ file: "songs", message: `cannot read songs directory: ${(e as Error).message}` });
    return { entries, errors };
  }

  const parsed: { file: string; entry: Entry }[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(dir, "songs", file), "utf8"));
    } catch (e) {
      errors.push({ file, message: `invalid JSON: ${(e as Error).message}` });
      continue;
    }
    const r = EntrySchema.safeParse(raw);
    if (!r.success) {
      for (const issue of r.error.issues) {
        const p = issue.path.join(".");
        errors.push({ file, message: p ? `${p}: ${issue.message}` : issue.message });
      }
      continue;
    }
    parsed.push({ file, entry: r.data });
  }

  const cardOwner = new Map<string, string>();
  for (const { file, entry } of parsed) {
    const before = errors.length;
    if (entry.slug !== file.replace(/\.json$/, "")) {
      errors.push({
        file,
        message: `slug "${entry.slug}" must equal the file name "${file.replace(/\.json$/, "")}"`,
      });
    }
    for (const card of entry.cards) {
      const other = cardOwner.get(card.id);
      if (other !== undefined) {
        errors.push({
          file,
          message: `duplicate card id "${card.id}" (also in ${other}; this file: ${file})`,
        });
      } else {
        cardOwner.set(card.id, file);
      }
    }
    if (entry.cover.file !== `${entry.slug}.jpg`) {
      errors.push({ file, message: `cover.file must be "${entry.slug}.jpg" (got "${entry.cover.file}")` });
    }
    const coverRel = `covers/${entry.cover.file}`;
    const coverProblem = await checkCover(path.join(dir, coverRel), coverRel, minCoverPx(entry.slug));
    if (coverProblem) errors.push({ file, message: coverProblem });
    for (const card of entry.cards) {
      const poster = card.film?.poster;
      if (!poster) continue;
      if (poster.file !== `${card.id}.jpg`) {
        errors.push({ file, message: `${card.id}: film.poster.file must be "${card.id}.jpg" (got "${poster.file}")` });
        continue;
      }
      const posterRel = `posters/${poster.file}`;
      try {
        const st = await fs.stat(path.join(dir, posterRel));
        if (st.size > MAX_IMAGE_BYTES) {
          errors.push({ file, message: `poster ${posterRel} is ${Math.round(st.size / 1024)} KB, over the 250 KB limit` });
        }
      } catch {
        errors.push({ file, message: `poster file not found: ${posterRel}` });
      }
    }
    if (errors.length === before) entries.push(entry);
  }

  entries.sort(
    (a, b) =>
      b.addedAt.localeCompare(a.addedAt) ||
      a.artist.localeCompare(b.artist) ||
      a.title.localeCompare(b.title),
  );
  return { entries, errors };
}

export async function loadEntries(dir: string = CONTENT_DIR): Promise<Entry[]> {
  const { entries, errors } = await checkEntries(dir);
  if (errors.length) {
    throw new Error(
      `Content problems:\n${errors.map((e) => `${e.file}: ${e.message}`).join("\n")}`,
    );
  }
  return entries;
}

export async function getEntry(slug: string, dir: string = CONTENT_DIR): Promise<Entry | undefined> {
  return (await loadEntries(dir)).find((e) => e.slug === slug);
}

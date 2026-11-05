import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CONTENT_DIR, type ContentError } from "./load";

/** Characters as a reader counts them: an emoji is one, not two UTF-16 units. */
const codePoints = (s: string) => [...s].length;
const upTo = (max: number) => z.string().refine((s) => codePoints(s) >= 1 && codePoints(s) <= max, `1 to ${max} characters`);

/**
 * A comment a visitor left on a song and the user approved (merged its pull request): one file,
 * content/visitor-comments/<song>/<id>.json. Only what the visitor typed, the song and the day; nothing else about them.
 */
export const VisitorCommentSchema = z
  .object({
    id: z.string().regex(/^\d{8}-[a-z0-9]{6}$/, "YYYYMMDD-xxxxxx"),
    song: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "a song slug"),
    text: upTo(600),
    // Left blank, the comment is anonymous.
    name: upTo(40).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  })
  .strict();

export type VisitorComment = z.infer<typeof VisitorCommentSchema>;

/** The row's order: newest first; on the same day, the later id first. */
const newestFirst = (a: VisitorComment, b: VisitorComment) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

async function list(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((d) => !d.name.startsWith(".")).map((d) => d.name).sort();
  } catch {
    return []; // no comments yet: the folder only exists once one is approved
  }
}

/**
 * Every approved comment, by song, checked: valid, named after its id, in the folder of the song it names, and that
 * song one of `slugs`. A missing visitor-comments folder means no comments.
 */
export async function checkVisitorComments(
  dir: string,
  slugs: Set<string>,
): Promise<{ bySong: Map<string, VisitorComment[]>; errors: ContentError[] }> {
  const root = path.join(dir, "visitor-comments");
  const bySong = new Map<string, VisitorComment[]>();
  const errors: ContentError[] = [];
  for (const song of await list(root)) {
    const files = (await list(path.join(root, song))).filter((f) => f.endsWith(".json"));
    for (const name of files) {
      const file = `visitor-comments/${song}/${name}`;
      let raw: unknown;
      try {
        raw = JSON.parse(await fs.readFile(path.join(root, song, name), "utf8"));
      } catch (e) {
        errors.push({ file, message: `invalid JSON: ${(e as Error).message}` });
        continue;
      }
      const r = VisitorCommentSchema.safeParse(raw);
      if (!r.success) {
        for (const issue of r.error.issues) errors.push({ file, message: issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message });
        continue;
      }
      const c = r.data;
      if (`${c.id}.json` !== name) errors.push({ file, message: `id "${c.id}" must equal the file name "${name.replace(/\.json$/, "")}"` });
      else if (c.song !== song) errors.push({ file, message: `song "${c.song}" must equal its folder "${song}"` });
      else if (!slugs.has(song)) errors.push({ file, message: `"${song}" is not a song in content/songs` });
      else bySong.set(song, [...(bySong.get(song) ?? []), c]);
    }
  }
  for (const comments of bySong.values()) comments.sort(newestFirst);
  return { bySong, errors };
}

/**
 * One song's approved comments, newest first. A comment with a problem (a file broken by hand, one left behind by a song
 * that was taken down) is left out with a warning, never failing the build: a comment only ever adds to a page, so
 * skipping it is safe, and one bad file must not hold back every deploy.
 */
export async function loadVisitorComments(slug: string, dir: string = CONTENT_DIR): Promise<VisitorComment[]> {
  const songs = new Set((await list(path.join(dir, "songs"))).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
  const { bySong, errors } = await checkVisitorComments(dir, songs);
  for (const e of errors) if (e.file.startsWith(`visitor-comments/${slug}/`)) console.warn(`skipped ${e.file}: ${e.message}`);
  return bySong.get(slug) ?? [];
}

/** A new comment's id: the day (UTC) and six random base-36 characters, e.g. "20261104-k3x9q2". */
export function newCommentId(now: Date, random: () => number = Math.random): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const tail = Array.from({ length: 6 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(random() * 36)]).join("");
  return `${day}-${tail}`;
}

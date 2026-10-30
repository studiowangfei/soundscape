// Copies content/covers/*, content/posters/* and content/icons/* to public/ (gitignored) so they are served
// same-origin. Empties each target first, so renamed or deleted images don't linger.
import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "../src/content/load";

for (const dir of ["covers", "posters", "icons"]) {
  const from = path.join(CONTENT_DIR, dir);
  const to = path.resolve(process.cwd(), "public", dir);
  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(to, { recursive: true });
  const files = (await fs.readdir(from).catch(() => [] as string[])).filter((f) => !f.startsWith("."));
  for (const f of files) await fs.copyFile(path.join(from, f), path.join(to, f));
  console.log(`synced ${files.length} ${dir} to public/${dir}`);
}

// Copies content/covers/*, content/posters/* and content/icons/* to public/ (gitignored) so they are served
// same-origin. Empties each target first, so renamed or deleted images don't linger. Only files: a folder in there (like
// icons/svg, the search bar's icon drawings, which are built into the code) isn't copied.
import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "../src/content/load";

for (const dir of ["covers", "posters", "icons"]) {
  const from = path.join(CONTENT_DIR, dir);
  const to = path.resolve(process.cwd(), "public", dir);
  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
  for (const f of files) await fs.copyFile(path.join(from, f), path.join(to, f));
  console.log(`synced ${files.length} ${dir} to public/${dir}`);
}

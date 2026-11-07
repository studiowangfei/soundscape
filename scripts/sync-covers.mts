// Copies content/posters/* and content/icons/* to public/ (gitignored) so they are served same-origin, and makes each
// cover's two WebP sizes (content/covers/<slug>.jpg → public/covers/<slug>-1200.webp and -2048.webp); the JPEG itself
// isn't served. Empties each target first, so renamed or deleted images don't linger. Only files: a folder in there
// (like icons/svg, the search bar's icon drawings, which are built into the code) isn't copied. No fallback: if sharp
// fails, this fails, and so does the build.
import fs from "node:fs/promises";
import path from "node:path";
import { buildCoverWebps } from "../src/content/cover-build";
import { CONTENT_DIR } from "../src/content/load";

for (const dir of ["covers", "posters", "icons"]) {
  const from = path.join(CONTENT_DIR, dir);
  const to = path.resolve(process.cwd(), "public", dir);
  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
  if (dir === "covers") {
    let count = 0;
    let bytes = 0;
    for (const f of files) {
      const made = await buildCoverWebps(path.join(from, f), to, path.parse(f).name);
      count += made.length;
      bytes += made.reduce((sum, m) => sum + m.bytes, 0);
    }
    console.log(`made ${count} WebP covers (${(bytes / 1024 / 1024).toFixed(1)} MB) in public/covers`);
    continue;
  }
  for (const f of files) await fs.copyFile(path.join(from, f), path.join(to, f));
  console.log(`synced ${files.length} ${dir} to public/${dir}`);
}

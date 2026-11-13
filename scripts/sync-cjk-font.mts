// Makes the Chinese typeface's font files (src/content/cjk-font.ts): asks Google Fonts for Noto Serif SC subset to the
// Chinese characters in the songs and approved visitor comments, downloads the files into public/fonts/noto-serif-sc/
// (gitignored) under names made from their contents, and writes fonts.css there, the @font-face rules the root layout
// inlines, pointing at them. Visitors then load the font from the site itself, never from Google.
// Up to date already (the same characters as last time, every file there): nothing is fetched. A new set is made in a
// folder beside it and swapped in only once complete, so a failure leaves the last good one in place.
// Run by `npm run build` (prebuild: a failure fails the build, and the live site keeps its last good deploy) and
// `npm run dev` (predev, with --soft: a failure only warns, and the dev server shows the device's own Chinese font).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CJK_TYPEFACE, cjkCharacters } from "../src/components/typeface";
import { CJK_FONT_CSS, CJK_FONT_DIR, cjkFontSourceHrefs, coveredCodePoints, fontUrls, selfHostedCss } from "../src/content/cjk-font";
import { CONTENT_DIR, loadEntries } from "../src/content/load";
import { checkVisitorComments } from "../src/content/visitors";

const soft = process.argv.includes("--soft");
const out = path.resolve(process.cwd(), "public", CJK_FONT_DIR);
// Google serves WOFF2 to browsers it knows read it.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const LICENSE = path.resolve(import.meta.dirname, "noto-serif-sc-OFL.txt");

async function get(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
      return res;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

try {
  // The text the site shows from content: the entries (less their research notes, never shown) and approved comments.
  const entries = await loadEntries();
  const visitors = await checkVisitorComments(CONTENT_DIR, new Set(entries.map((e) => e.slug)));
  const text = JSON.stringify([entries.map((e) => ({ ...e, provenance: undefined })), [...visitors.bySong.values()]]);
  const chars = cjkCharacters(text);
  const key = crypto.createHash("sha256").update(`${CJK_TYPEFACE.google}\n${chars}`).digest("hex").slice(0, 16);

  const current = await fs.readFile(path.join(out, CJK_FONT_CSS), "utf8").catch(() => "");
  const have = await fs.readdir(out).catch(() => [] as string[]);
  if (current.includes(`key: ${key}`) && fontUrls(current).every((u) => have.includes(path.basename(u)))) {
    console.log(`Chinese typeface up to date (${[...chars].length} characters)`);
  } else {
    const next = `${out}.next`;
    await fs.rm(next, { recursive: true, force: true });
    await fs.mkdir(next, { recursive: true });
    const rules: string[] = [];
    let bytes = 0;
    for (const href of cjkFontSourceHrefs(text)) {
      const css = await (await get(href)).text();
      const files = new Map<string, string>();
      for (const url of fontUrls(css)) {
        const data = Buffer.from(await (await get(url)).arrayBuffer());
        const name = `${crypto.createHash("sha256").update(data).digest("hex").slice(0, 12)}.woff2`;
        await fs.writeFile(path.join(next, name), data);
        files.set(url, name);
        bytes += data.length;
      }
      rules.push(selfHostedCss(css, (url) => files.get(url)!).trim());
    }
    const css = rules.join("\n");
    const covered = coveredCodePoints(css);
    const missing = [...chars].filter((c) => !covered.has(c.codePointAt(0)!));
    if (missing.length) console.warn(`warning: Noto Serif SC has no ${missing.join(" ")}; the device's own font draws ${missing.length > 1 ? "them" : "it"}`);
    const header = `/* Noto Serif SC (Google, SIL Open Font License 1.1: /${CJK_FONT_DIR}/OFL.txt), subset to the site's ${[...chars].length} Chinese characters by scripts/sync-cjk-font.mts. key: ${key} */`;
    await fs.writeFile(path.join(next, CJK_FONT_CSS), chars ? `${header}\n${css}\n` : "");
    await fs.copyFile(LICENSE, path.join(next, "OFL.txt"));
    await fs.rm(out, { recursive: true, force: true });
    await fs.rename(next, out);
    const count = fontUrls(css).length;
    console.log(`made the Chinese typeface: ${count} file${count === 1 ? "" : "s"} (${Math.round(bytes / 1024)} KB) for ${[...chars].length} characters in public/${CJK_FONT_DIR}`);
  }
} catch (e) {
  if (!soft) throw e;
  console.warn(`warning: couldn't make the Chinese typeface (${(e as Error).message}); Chinese shows in the device's own font`);
}

import { loadEntries } from "@/content/load";
import { Landing } from "@/components/landing/Landing";

export default async function Home() {
  const entries = await loadEntries();
  const songs = entries.map(({ slug, title, artist, aliases, tags, cover }) => ({ slug, title, artist, aliases, tags, cover: { file: cover.file, kind: cover.kind } }));
  return (
    <>
      <Landing songs={songs} />
      {/* Without JavaScript (and for crawlers), every song as a plain link. */}
      <noscript>
        <ul className="relative mx-auto max-w-xl space-y-1 px-5 pt-24 pb-16">
          {songs.map((s) => (
            <li key={s.slug}>
              <a href={`/songs/${s.slug}/`} className="block py-1.5 font-serif text-[20px] text-white/85 hover:text-white">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </noscript>
    </>
  );
}

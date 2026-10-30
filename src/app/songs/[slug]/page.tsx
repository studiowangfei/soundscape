import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SongView } from "@/components/SongView";
import { getEntry, loadEntries } from "@/content/load";
import { neighbours } from "@/content/neighbours";

// Only the entries in content/songs exist; anything else is the 404 page.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadEntries()).map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/songs/[slug]">): Promise<Metadata> {
  const entry = await getEntry((await params).slug);
  return entry ? { title: `${entry.title} – ${entry.artist} · Musimore` } : {};
}

export default async function SongPage({ params }: PageProps<"/songs/[slug]">) {
  const { slug } = await params;
  const entries = await loadEntries();
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) notFound();
  // Keyed by song, so going to the previous or next song starts its page afresh (player, cards, backdrop).
  return <SongView key={entry.slug} entry={entry} nav={neighbours(entries, entry.slug)} />;
}

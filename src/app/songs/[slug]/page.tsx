import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SongView } from "@/components/SongView";
import { getEntry, loadEntries } from "@/content/load";
import { neighbours } from "@/content/neighbours";
import { loadVisitorComments } from "@/content/visitors";

// Only the entries in content/songs exist; anything else is the 404 page.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadEntries()).map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/songs/[slug]">): Promise<Metadata> {
  const entry = await getEntry((await params).slug);
  return entry ? { title: `${entry.title} – ${entry.artist} · Soundscape` } : {};
}

export default async function SongPage({ params }: PageProps<"/songs/[slug]">) {
  const { slug } = await params;
  const entries = await loadEntries();
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) notFound();
  // Keyed by song, so going to the previous or next song starts its page afresh (cards, title; the backdrop crossfades
  // on the stage, backdrops/Stage.tsx, and the player skips its entrance, so it seems to stay put).
  // Its approved visitor comments (content/visitor-comments/<slug>/) follow its own cards, before the end card.
  const visitors = await loadVisitorComments(slug);
  return <SongView key={entry.slug} entry={entry} visitors={visitors} nav={neighbours(entries, entry.slug)} titles={entries.map((e) => e.title)} />;
}

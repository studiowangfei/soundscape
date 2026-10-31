"use client";

import Link from "next/link";
import type { Neighbours } from "@/content/neighbours";
import type { Entry } from "@/content/schema";
import { Backdrop, BackdropSwitcher, useBackdropParams, useBackdropVariant } from "./backdrops/Backdrop";
import { CardGrid } from "./cards/CardGrid";
import { GlassProvider, useGlassTune } from "./glass/Glass";
import { LANDING_FOCUS_KEY, sessionSet } from "./landing/settings";
import { PreviewBar } from "./player/Players";
import { streamLinks } from "./player/stream-links";
import { TUNING } from "./tuning";
import { useTypeface } from "./useTypeface";

/**
 * One song, laid out after the Figma song page: the title, artist and preview player at the top left, and the cards in
 * a row along the foot of the page, over the cover backdrop. (Spacing in px: 80 from the left, the header 40 from the
 * top, the cards 40 from the bottom. The design's wordmark is hidden for now.)
 */
export function SongView({ entry, nav = null }: { entry: Entry; nav?: Neighbours | null }) {
  const [variant, setVariant] = useBackdropVariant();
  const tune = useBackdropParams();
  const typeface = useTypeface();
  const glass = useGlassTune();
  const backdrop = { title: entry.title, artist: entry.artist, cover: `/covers/${entry.cover.file}`, coverKind: entry.cover.kind };

  return (
    <GlassProvider value={glass.settings}>
    <main className="flex min-h-dvh w-full flex-col">
      {/* Back to all songs: the landing page, its wheel on this song. */}
      <Link
        href="/"
        onClick={() => sessionSet(LANDING_FOCUS_KEY, entry.slug)}
        aria-label="Close, back to all songs"
        title="Back to all songs"
        className="fixed top-[max(1.25rem,env(safe-area-inset-top))] right-[max(1.25rem,env(safe-area-inset-right))] z-30 grid size-11 place-items-center rounded-full text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 5l14 14M19 5 5 19" />
        </svg>
      </Link>
      {/* In the stacked layout (portrait screens) the cover fills the top of the page; start the song header over its
          fading lower edge. Side margins keep clear of a notch (px-page); phones held sideways (short) get less air. */}
      <div aria-hidden className="h-[40vw] shrink-0 wide:hidden" />
      <header className="px-page pt-10 short:pt-6">
        <h1 className="max-w-[56rem] font-serif text-[40px] leading-[1.24] font-medium text-white sm:text-[48px] short:text-[36px]">{entry.title}</h1>
        {/* Margins set for the visible gaps: 15px from the title's descenders to the artist, 50px from the artist's to the player. */}
        <p className="mt-1 text-[24px] text-[#777]">{entry.artist}</p>
        <div className="mt-[45px] short:mt-6">
          <PreviewBar cover={backdrop.cover} preview={entry.preview} nav={nav} links={streamLinks(entry)} />
        </div>
      </header>

      {/* The cards sit at the foot of the window; on phones they follow the player at the cards' own gap (CardGrid). */}
      <div className="min-h-10 flex-1 phone:hidden" />
      <CardGrid cards={entry.cards} className="pb-[max(28px,env(safe-area-inset-bottom))]" />

      <Backdrop key={`${entry.artist}|${entry.title}`} song={backdrop} variant={variant} params={tune.params[variant]} />
      {TUNING && (
        <BackdropSwitcher
          value={variant}
          onChange={setVariant}
          params={tune.params[variant]}
          onParam={(key, v) => tune.setParam(variant, key, v)}
          onReset={() => tune.reset(variant)}
          extra={[typeface.section, glass.section]}
        />
      )}
    </main>
    </GlassProvider>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { neighbours, type NavSong, type SongLink } from "@/content/neighbours";
import type { Entry } from "@/content/schema";
import type { VisitorComment } from "@/content/visitors";
import { BackdropSwitcher, songScene, useBackdropParams, useBackdropVariant } from "./backdrops/Backdrop";
import { Entrance, useStage, useStageScene } from "./backdrops/Stage";
import { TIMING } from "./backdrops/stage-model";
import { CardGrid } from "./cards/CardGrid";
import { rowCards } from "./cards/row";
import { useMobileCard } from "./cards/useMobileCard";
import { GlassProvider, useGlassTune } from "./glass/Glass";
import { Hit, ICON_HOVER, TOP_RIGHT } from "./icon";
import { iconBox, LANDING_FOCUS_KEY, landingScene, searchBarLook, sessionSet, useLandingSettings, wheelSettings } from "./landing/settings";
import { landingOrder, visitOrder } from "./landing/sort";
import { useWheelLayout } from "./landing/useWheelLayout";
import { ShakeDrops } from "./landing/ShakeDrops";
import { PreviewBar } from "./player/Players";
import { streamLinks } from "./player/stream-links";
import { TUNING } from "./tuning";
import { useTypeface } from "./useTypeface";

/**
 * One song, laid out after the Figma song page: the title, artist and preview player at the top left, and the cards in
 * a row along the foot of the window, over the cover backdrop; on phones (the Figma's mobile frame) the player joins
 * the cards at the foot. (Spacing in px: 64 from the left and the header 64 from the top on desktops and tablets, the cards 40 from the bottom.
 * The design's wordmark is hidden for now.)
 */
export function SongView({ entry, visitors = [], songs, titles }: { entry: Entry; visitors?: VisitorComment[]; songs: NavSong[]; titles: string[] }) {
  // Previous and next step through the songs as the landing wheel lists them this visit (its shuffle and the sort
  // chosen), which only the browser knows: until it's read, as the catalogue lists them.
  const [nav, setNav] = useState(() => neighbours(songs, entry.slug));
  useEffect(() => {
    const { sort, seed } = visitOrder();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the order lives in the browser's storage
    setNav(neighbours(landingOrder(songs, seed, sort), entry.slug));
  }, [songs, entry.slug]);
  const [variant, setVariant] = useBackdropVariant();
  const tune = useBackdropParams();
  const typeface = useTypeface();
  const glass = useGlassTune();
  const mobileCard = useMobileCard();
  // Close is drawn as big as the landing page's icons, so it's sized from the landing wheel's text, measured here too.
  const landing = useLandingSettings().settings;
  const look = searchBarLook(landing.bar);
  const layout = useWheelLayout(titles, typeface.key, wheelSettings(landing.wheel), look);
  const box = layout.ready ? iconBox(look, layout.geo.centerSize) : null;
  const backdrop = { title: entry.title, artist: entry.artist, cover: `/covers/${entry.cover.file}`, coverKind: entry.cover.kind };
  // The backdrop is the site's one window (backdrops/Stage.tsx): this song's pane on it (a new one per style while tuning,
  // so switching styles crossfades).
  const scene = songScene(entry.slug, backdrop, variant, tune.params[variant]);
  const sceneKey = scene.key;
  const stage = useStage();
  // Leaving this song: its title and cards (and, back to all songs, the player) fade out, then the next page comes.
  const [out, setOut] = useState<"landing" | "song" | null>(null);
  // (Not once it's on its way out: song to song, the next song's scene is already up, see go; nor before its saved
  // settings are read, so its fog is built once, with them.)
  useStageScene(out || !tune.ready ? null : scene);
  // Coming from another song, the title and cards wait (their entrances held at the start, hidden) until the cover's
  // crossfade is over, then come up.
  const [held, setHeld] = useState(() => stage.lastMode() === "song");
  useEffect(() => {
    if (held) return stage.afterShown(sceneKey, () => setHeld(false));
  }, [held, stage, sceneKey]);
  const router = useRouter();
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => void (gone.current = true); // gone already (Back): don't navigate after all
  }, []);
  const go = (href: string, to: "landing" | "song", next?: SongLink) => {
    if (out) return;
    // Back to all songs, the cover moves: the page changes once it's moving (its rendering then can't hold it up). The
    // landing page's fog starts building now, under the moving cover, so it's ready to mist over as the cover lands.
    const moving = to === "landing" ? stage.leave({ mode: "landing", song: backdrop, scene: landingScene(backdrop, landing.fog) }) : Promise.resolve();
    setOut(to);
    // To another song: its backdrop starts building now, while this page fades out and the next one loads, and
    // crossfades in as soon as it has drawn (the next page shows the very same scene, so it's kept).
    if (next) {
      const song = { title: next.title, artist: next.artist, cover: next.cover, coverKind: next.coverKind };
      stage.show(songScene(next.slug, song, variant, tune.params[variant]));
    }
    void Promise.all([moving, new Promise((r) => window.setTimeout(r, TIMING.songExit))]).then(() => !gone.current && router.push(href));
  };
  const fade = "transition-[opacity,translate] duration-[180ms] ease-out";

  return (
    <GlassProvider value={glass.settings}>
    <main data-song-page className={`flex min-h-dvh w-full flex-col ${held ? "entrance-hold" : ""}`} style={{ "--corner-box": box ? `${box}px` : undefined } as React.CSSProperties}>
      {/* Back to all songs: the landing page, its wheel on this song. In the top right corner, and drawn as
          big as it and the search bar's icons (Phosphor's x-circle, svg/x-circle.svg, its ring 13/16 of its box). */}
      <Link
        href="/"
        onClick={() => sessionSet(LANDING_FOCUS_KEY, entry.slug)}
        onNavigate={(e) => {
          e.preventDefault();
          go("/", "landing");
        }}
        aria-label="Close, back to all songs"
        title="Back to all songs"
        className={`${TOP_RIGHT} ${ICON_HOVER} text-[rgb(var(--icon))] ${box ? "" : "invisible"}`}
        // The landing search bar arrow's colour and opacity (Tune → Search bar), so the two read as one set of icons.
        style={{ width: box ?? 0, height: box ?? 0, "--icon": look.iconColor, "--icon-a": look.arrowOpacity } as React.CSSProperties}
      >
        {box && <Hit size={box} />}
        <svg viewBox="0 0 256 256" className="size-full" fill="currentColor" aria-hidden>
          <path d="M165.66,101.66,139.31,128l26.35,26.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
        </svg>
      </Link>
      {/* The title and artist at the top left of the window on every screen (on phones as the Figma's mobile frame has
          them: 20px in from the top and the left, stopping 12px short of the close button's circle). Side margins keep
          clear of a notch (px-page), and on phones the top clears the status bar. */}
      <header className={`${fade} ${out ? "opacity-0" : ""} px-page pt-16 phone:pt-[max(1.25rem,env(safe-area-inset-top))] phone:pr-[calc(max(1.25rem,calc(env(safe-area-inset-right)+0.5rem))_+_var(--corner-box,40px)*29/32_+_12px)]`}>
        <Entrance>
          <h1 className="max-w-[56rem] font-serif text-[40px] leading-[1.24] font-medium text-white sm:text-[48px] short:text-[36px]">{entry.title}</h1>
        </Entrance>
        {/* Set for the visible gap: 15px from the title's descenders to the artist. */}
        <Entrance as="p" className="mt-1 text-[24px] text-white">
          {entry.artist}
        </Entrance>
      </header>

      {/* The cards sit at the foot of the window, with either card size (Tune → Cards): pushed down by the space above
          them, and held there (sticky) when the window is too short for everything, so the top of the page slides under
          them. The player goes under the song's name, 50px from the artist's descenders; on phones it joins the cards,
          at their own gap above them (CardGrid). One player either way: elsewhere its group is see-through to the page's
          layout (contents), and the order puts it under the header and the cards at the foot; on phones the group is one
          block, after the space, held at the foot. */}
      {/* A finger here wipes the fog only after a hold (the row scrolls sideways; the player has its controls). */}
      <div data-wipe-hold className="contents phone:sticky phone:bottom-0 phone:order-2 phone:block">
        {/* The player stays put from song to song (no entrance coming from another song's page). */}
        <div className={`${fade} ${out === "landing" ? "opacity-0" : ""} order-1 mt-[45px] px-page phone:mt-0`}>
          <Entrance stayFrom="song">
            <PreviewBar cover={backdrop.cover} preview={entry.preview} nav={nav} links={streamLinks(entry)} onSkip={(href, to) => go(href, "song", to)} />
          </Entrance>
        </div>
        <CardGrid
          cards={rowCards(entry.cards, visitors, entry.slug)}
          mobile={mobileCard.variant}
          className={`${fade} ${out ? "translate-y-1.5 opacity-0" : ""} sticky bottom-0 order-3 pb-[max(28px,env(safe-area-inset-bottom))] phone:static`}
        />
      </div>
      <div className="order-2 min-h-10 flex-1 phone:order-1" />

      {/* Shaking the phone lets drops fall down this song's glass, as on the landing page (landing/ShakeDrops; on an
          iPhone once the motion sensor has been allowed, which the landing page's 💧 asks for). */}
      <ShakeDrops ready={!out && tune.ready} onDrop={() => stage.drip(sceneKey)} />

      {TUNING && (
        <BackdropSwitcher
          value={variant}
          onChange={setVariant}
          params={tune.params[variant]}
          onParam={(key, v) => tune.setParam(variant, key, v)}
          onReset={() => tune.reset(variant)}
          lead={[typeface.section]}
          extra={[glass.section, mobileCard.section]}
        />
      )}
    </main>
    </GlassProvider>
  );
}

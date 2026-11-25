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
import { IconVersions } from "./cards/icon-context";
import type { PageDir } from "./paging";
import { TUNING } from "./tuning";
import { useSongTurn } from "./useSongTurn";
import { useTurnTune } from "./useTurnTune";
import { useTypeface } from "./useTypeface";

/**
 * One song, laid out after the Figma song page: the title, artist and preview player at the top left, and the cards in
 * a row along the foot of the window, over the cover backdrop; on phones (the Figma's mobile frame) the player joins
 * the cards at the foot, above them (the Figma) or below (Tune → Cards). (Spacing in px: 64 from the left and the header 40 from the top on desktops and tablets, the
 * cards 28 from the bottom, 13 on phones, their own gap. The design's wordmark is hidden for now.) Up and down turn to the next and previous song (useSongTurn: a swipe, the
 * wheel, ↑ / ↓; docs/plans/2026-11-17-song-paging-design.md), as ⏮ / ⏭ do.
 */
export function SongView({ entry, visitors = [], songs, titles, icons = {} }: { entry: Entry; visitors?: VisitorComment[]; songs: NavSong[]; titles: string[]; icons?: Record<string, string> }) {
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
  const playerBelow = mobileCard.player === "below";
  const turnTune = useTurnTune({ cover: true });
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
  // Turned to as the next song (1) or the previous (-1): its title comes up from below, or down from above.
  const [turnedIn] = useState(() => stage.turnOf(sceneKey));
  // Leaving this song: its title and cards (and, back to all songs, the player) fade out, then the next page comes;
  // to another song, they drift the way the songs turn (up to the next one, down to the previous).
  const [out, setOut] = useState<"landing" | "song" | null>(null);
  const [outDir, setOutDir] = useState<PageDir | 0>(0);
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
  // Back to all songs (Close, or Back after turning through songs), the landing wheel comes up on the song last shown.
  useEffect(() => {
    sessionSet(LANDING_FOCUS_KEY, entry.slug);
  }, [entry.slug]);
  // `dir`: to the next or previous song, which way the page turns (⏮ / ⏭ and the gestures); `replace`: in place of this
  // page in the history (the gestures: Back goes to the page before the songs, not through each).
  const go = (href: string, to: "landing" | "song", next?: SongLink, how: { dir?: PageDir; replace?: boolean } = {}) => {
    if (out) return;
    // Back to all songs, the cover moves: the page changes once it's moving (its rendering then can't hold it up). The
    // landing page's fog starts building now, under the moving cover, so it's ready to mist over as the cover lands.
    const moving = to === "landing" ? stage.leave({ mode: "landing", song: backdrop, scene: landingScene(backdrop, landing.fog) }) : Promise.resolve();
    setOut(to);
    setOutDir(how.dir ?? 0);
    // To another song: its backdrop starts building now, while this page fades out and the next one loads, and
    // crossfades in as soon as it has drawn, drifting the way the songs turn (the next page shows the very same scene,
    // so it's kept).
    if (next) {
      const song = { title: next.title, artist: next.artist, cover: next.cover, coverKind: next.coverKind };
      stage.show(songScene(next.slug, song, variant, tune.params[variant]), { drift: (how.dir ?? 0) * turnTune.drift });
    }
    void Promise.all([moving, new Promise((r) => window.setTimeout(r, TIMING.songExit))]).then(() => !gone.current && (how.replace ? router.replace(href) : router.push(href)));
  };
  const turnTo = (dir: PageDir) => {
    const to = nav && (dir === 1 ? nav.next : nav.prev);
    if (to) go(`/songs/${to.slug}/`, "song", to, { dir, replace: true });
  };
  useSongTurn(turnTo);
  // How far the title and cards drift as they fade out to another song (px; the incoming title's own rise: globals.css
  // page-enter).
  const outShift = out === "song" && outDir ? { translate: `0 ${-outDir * 8}px` } : undefined;
  const fade = "transition-[opacity,translate] duration-[180ms] ease-out";

  return (
    // The fingerprints of the cards' icons, for their addresses (cards/Attribution).
    <IconVersions.Provider value={icons}>
    <GlassProvider value={glass.settings}>
    <main data-song-page className={`flex min-h-dvh w-full flex-col ${held ? "entrance-hold" : ""}`} style={{ "--corner-box": box ? `${box}px` : undefined, "--enter-y": turnedIn < 0 ? "-8px" : undefined } as React.CSSProperties}>
      {/* Back to all songs: the landing page, its wheel on this song. In the top right corner, and drawn as
          big as it and the search bar's icons (Phosphor's x-circle, svg/x-circle.svg, its ring 13/16 of its box). */}
      <Link
        href="/"
        onClick={() => sessionSet(LANDING_FOCUS_KEY, entry.slug)}
        onNavigate={(e) => {
          e.preventDefault();
          go("/", "landing");
        }}
        aria-label="Close, back to song wheel"
        title="Back to song wheel"
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
          them, 20px in from the left). The title runs as wide as there's room for, on one line where it fits: on the
          right it stops short of the close button's circle (px-beside-close, which keeps clear of a notch too). Its box
          starts at its capitals (text-box trim), so the gap above the letters is the padding's 40px on desktops and
          tablets (the line height had put them 6-8px lower); on phones they come level with the top of the close button's
          circle (its corner, plus the 3/32 of its box above the circle), which clears the status bar. */}
      <header style={outShift} className={`${fade} ${out ? "opacity-0" : ""} px-beside-close pt-10 phone:pt-[calc(var(--corner-top)_+_var(--corner-box,40px)*3/32)]`}>
        <Entrance>
          <h1 className="font-serif text-[48px] leading-[1.24] font-medium [text-box:trim-start_cap_alphabetic] text-white phone:text-[36px]">{entry.title}</h1>
        </Entrance>
        {/* Set for the visible gap: 15px from the title's descenders to the artist (13.5 on phones, where it's 21px). */}
        <Entrance as="p" className="mt-1 text-[24px] text-white phone:text-[21px]">
          {entry.artist}
        </Entrance>
      </header>

      {/* The cards sit at the foot of the window, with either card size (Tune → Cards): pushed down by the space above
          them, and held there (sticky) when the window is too short for everything, so the top of the page slides under
          them. The player goes under the song's name, 50px from the artist's descenders; on phones it joins the cards,
          at their own gap (13px, CardGrid) above them, or below them (Tune → Cards: Player on phones), the window's foot
          then under the player. One player either way: elsewhere its group is see-through to the page's layout
          (contents), and the order puts it under the header and the cards at the foot; on phones the group is one column,
          after the space, held at the foot, its order putting the player above the cards or below. */}
      <div className="contents phone:sticky phone:bottom-0 phone:order-2 phone:flex phone:flex-col">
        {/* The player stays put from song to song (no entrance coming from another song's page); its cover changes with
            the backdrop (PlayerCover). A finger wipes the fog behind it only after holding still (data-wipe-hold:
            backdrops/variants.tsx), as it's mostly controls. */}
        <div data-wipe-hold className={`${fade} ${out === "landing" ? "opacity-0" : ""} order-1 mt-[45px] px-page phone:mt-0 ${playerBelow ? "phone:order-4 phone:pb-[max(13px,env(safe-area-inset-bottom))]" : ""}`}>
          <Entrance stayFrom="song">
            <PreviewBar cover={backdrop.cover} coverDrift={turnTune.coverDrift} preview={entry.preview} nav={nav} links={streamLinks(entry)} onSkip={(href, to, dir) => go(href, "song", to, { dir })} />
          </Entrance>
        </div>
        <CardGrid
          cards={rowCards(entry.cards, visitors, entry.slug)}
          mobile={mobileCard.variant}
          style={outShift}
          // On phones the row ends the cards' own gap (13px) above the window's bottom, clear of the home indicator, or
          // above the player under them.
          className={`${fade} ${out === "landing" ? "translate-y-1.5" : ""} ${out ? "opacity-0" : ""} sticky bottom-0 order-3 pb-[max(28px,env(safe-area-inset-bottom))] phone:static ${playerBelow ? "phone:pb-[13px]" : "phone:pb-[max(13px,env(safe-area-inset-bottom))]"}`}
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
          extra={[glass.section, mobileCard.section, turnTune.section]}
        />
      )}
    </main>
    </GlassProvider>
    </IconVersions.Provider>
  );
}

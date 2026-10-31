"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useArtwork, type Song } from "../backdrops/art";
import { TunePanel } from "../backdrops/Backdrop";
import { SEARCH_BAR_PARAMS, WHEEL_PARAMS } from "../backdrops/params";
import { WINDOW_SEED } from "../backdrops/fog-render";
import { Fog } from "../backdrops/variants";
import { SiteHeader } from "../SiteHeader";
import { BackgroundMusic } from "./BackgroundMusic";
import { TUNING } from "../tuning";
import { useTypeface } from "../useTypeface";
import { coarseNow } from "../env";
import { LANDING_FOCUS_KEY, LANDING_FOG_SPECS, pairShown, searchBarLook, sessionGet, sessionSet, useLandingSettings, wheelSettings, type Shown } from "./settings";
import { SongWheel } from "./SongWheel";
import { matchIndex, prefetchRows } from "./wheel";

export type LandingSong = {
  slug: string;
  title: string;
  artist: string;
  aliases: string[];
  tags: string[];
  cover: { file: string; kind: "album" | "artist" };
  /** The song's 30-second preview, for the page's music; null if it has none. */
  preview: string | null;
};


/**
 * The landing page: a wheel of song titles in the middle of the screen, over the resting song's album art filling the
 * window under the Fog effect (no writing on the glass), a search bar round the centred song, and music (the
 * background song's preview) to switch on in the corner; while developing, a Tune panel too.
 */
export function Landing({ songs }: { songs: LandingSong[] }) {
  const router = useRouter();
  const tune = useLandingSettings();
  const typeface = useTypeface();
  const titles = useMemo(() => songs.map((s) => s.title), [songs]);
  // The wheel mounts once the starting song is known (it lives in sessionStorage, so not in the static HTML).
  const [start, setStart] = useState<number | null>(null);
  const [wanted, setWanted] = useState<number | null>(null); // where the wheel should be (search, rest)
  const [focus, setFocus] = useState<number | null>(null); // nearest the centre right now
  const [aim, setAim] = useState<number | null>(null); // where it's heading: drives the background
  const [arrived, setArrived] = useState<number | null>(null); // all but there: the background may change
  const [rested, setRested] = useState<number | null>(null); // where it came to rest
  const [query, setQuery] = useState<string | null>(null); // what's typed in the bar; null when not searching
  const index = wanted ?? start ?? 0;
  const focused = focus ?? start ?? 0;
  const rest = rested ?? start ?? 0;
  const heading = aim ?? rest;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the start position is only known after mount
    setStart(Math.max(0, songs.findIndex((s) => s.slug === sessionGet(LANDING_FOCUS_KEY))));
  }, [songs]);

  // The background moves to the song the wheel is heading for, song and cover together: its cover loads and its fog is
  // made while the wheel turns, and goes up as the wheel arrives (never for a song it only passes on the way).
  const coverOf = (i: number) => `/covers/${songs[i].cover.file}`;
  const art = useArtwork(coverOf(heading), songs[heading].cover.kind);
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the loaded artwork
    setShown((prev) => pairShown(prev, heading, art, (i) => `/covers/${songs[i].cover.file}`));
  }, [art, heading, songs]);
  const shownSong = shown ? songs[shown.i] : null;
  const song: Song | null = shownSong && { title: shownSong.title, artist: shownSong.artist, cover: `/covers/${shownSong.cover.file}`, coverKind: shownSong.cover.kind };

  // Covers either side of the focused song load ahead, so wherever the wheel stops its background is ready sooner.
  const fetched = useRef(new Set<number>());
  useEffect(() => {
    for (const i of prefetchRows(focused, songs.length)) {
      if (fetched.current.has(i)) continue;
      fetched.current.add(i);
      new Image().src = `/covers/${songs[i].cover.file}`;
    }
  }, [focused, songs]);

  const open = (i: number, newTab: boolean) => {
    const url = `/songs/${songs[i].slug}/`;
    if (newTab) window.open(url, "_blank", "noopener");
    else router.push(url);
  };
  const onRest = (i: number) => {
    setRested(i);
    setWanted(i);
    sessionSet(LANDING_FOCUS_KEY, songs[i].slug);
  };
  // Search happens in the bar round the centred song. Each letter spins the wheel to the first match; a pause in typing
  // (or Enter) settles on it, and the bar shows the song again. On touch screens a pause doesn't: settling closes the
  // on-screen keyboard, and people pause between letters there; Search on the keyboard (Enter), or tapping away, does.
  const settle = useRef(0);
  const startSearch = () => {
    clearTimeout(settle.current);
    setQuery("");
  };
  const stopSearch = () => {
    clearTimeout(settle.current);
    setQuery(null);
  };
  const search = (q: string) => {
    setQuery(q);
    clearTimeout(settle.current);
    const i = matchIndex(songs, q);
    if (i === null) return;
    setWanted(i);
    if (!coarseNow()) settle.current = window.setTimeout(stopSearch, 1000);
  };
  useEffect(() => () => clearTimeout(settle.current), []);
  const noMatch = query !== null && query.trim() !== "" && matchIndex(songs, query) === null;
  const lift = useKeyboardLift();

  // The whole page is the wheel's to touch (touch-none: no page scrolling, zooming or pull-to-refresh to fight with).
  return (
    <main className="fixed inset-0 touch-none overflow-hidden select-none">
      {/* As tall as the window with the browser's toolbars away (h-lvh), so the fog isn't rebuilt as they come and go. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh bg-[#0d0b0a]">
        {shown && song && <Fog art={shown.art} p={{ ...tune.settings.fog, text: 0 }} song={song} layout="fill" hold={(arrived ?? rest) !== shown.i} seed={WINDOW_SEED} />}
        {/* A soft dim behind the wheel, so titles read on any cover. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_center,rgba(13,11,10,0.5),transparent)]" />
      </div>

      <div className="absolute top-0 left-0 px-5 pt-5">
        <SiteHeader />
      </div>

      <div className="absolute inset-x-0 top-1/2 transition-transform duration-300 ease-out" style={{ transform: `translateY(calc(-50% + ${lift}px))` }}>
        {start !== null && (
          <SongWheel
            titles={titles}
            index={index}
            settings={wheelSettings(tune.settings.wheel)}
            onFocus={setFocus}
            onAim={setAim}
            onArrive={setArrived}
            onRest={onRest}
            onOpen={open}
            fontKey={typeface.key}
            search={{
              look: searchBarLook(tune.settings.bar),
              query,
              noMatch,
              onSearch: startSearch,
              onQuery: search,
              onEnter: () => query !== null && matchIndex(songs, query) !== null && stopSearch(),
              onDone: stopSearch,
            }}
          />
        )}
      </div>

      <BackgroundMusic src={shownSong ? shownSong.preview : undefined} />

      {TUNING && (
        <TunePanel
          sections={[
            { title: "Fog", specs: LANDING_FOG_SPECS, values: tune.settings.fog, onParam: tune.setFog },
            { title: "Wheel", specs: WHEEL_PARAMS, values: tune.settings.wheel, onParam: tune.setWheel },
            { title: "Search bar", specs: SEARCH_BAR_PARAMS, values: tune.settings.bar, onParam: tune.setBar },
            typeface.section,
          ]}
          onReset={tune.reset}
        />
      )}
    </main>
  );
}

/**
 * While an on-screen keyboard is up (phones, tablets), how far to move the wheel so the search bar sits in the middle
 * of what's still visible rather than at the keyboard's edge: the visible area's centre less the window's, px.
 */
function useKeyboardLift() {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setLift(vv.height < window.innerHeight * 0.85 ? Math.round(vv.offsetTop + vv.height / 2 - window.innerHeight / 2) : 0);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return lift;
}

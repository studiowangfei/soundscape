"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useArtwork, type Song } from "../backdrops/art";
import { TunePanel } from "../backdrops/Backdrop";
import { SEARCH_BAR_PARAMS, WHEEL_PARAMS } from "../backdrops/params";
import { WINDOW_SEED } from "../backdrops/fog-render";
import { Fog } from "../backdrops/variants";
import { SiteHeader } from "../SiteHeader";
import { TUNING } from "../tuning";
import { useTypeface } from "../useTypeface";
import { LANDING_FOCUS_KEY, LANDING_FOG_SPECS, pairShown, searchBarLook, sessionGet, sessionSet, useLandingSettings, wheelSettings, type Shown } from "./settings";
import { SongWheel } from "./SongWheel";
import { matchIndex, prefetchRows } from "./wheel";

export type LandingSong = { slug: string; title: string; artist: string; aliases: string[]; tags: string[]; cover: { file: string; kind: "album" | "artist" } };


/**
 * The landing page: a wheel of song titles in the middle of the screen, over the resting song's album art filling the
 * window under the Fog effect (no writing on the glass), and a search bar round the centred song; while developing, a
 * Tune panel too.
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
  // (or Enter) settles on it, and the bar shows the song again.
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
    settle.current = window.setTimeout(stopSearch, 1000);
  };
  useEffect(() => () => clearTimeout(settle.current), []);
  const noMatch = query !== null && query.trim() !== "" && matchIndex(songs, query) === null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[#0d0b0a]">
        {shown && song && <Fog art={shown.art} p={{ ...tune.settings.fog, text: 0 }} song={song} layout="fill" hold={(arrived ?? rest) !== shown.i} seed={WINDOW_SEED} />}
        {/* A soft dim behind the wheel, so titles read on any cover. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_center,rgba(13,11,10,0.5),transparent)]" />
      </div>

      <div className="absolute top-0 left-0 px-5 pt-5">
        <SiteHeader />
      </div>

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
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

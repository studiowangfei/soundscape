"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useArtwork, type Song } from "../backdrops/art";
import { savedSongScene, TunePanel } from "../backdrops/Backdrop";
import { SEARCH_BAR_PARAMS, WHEEL_PARAMS } from "../backdrops/params";
import { Entrance, useStage, useStageScene } from "../backdrops/Stage";
import { TIMING } from "../backdrops/stage-model";
import { EmojiButton, LANDING_DICE, LANDING_DROP } from "../icon";
import { AutoRotate } from "./AutoRotate";
import { BackgroundMusic } from "./BackgroundMusic";
import { Wordmark } from "./Wordmark";
import { TUNING } from "../tuning";
import { useTypeface } from "../useTypeface";
import { iconBox, LANDING_FOCUS_KEY, LANDING_FOG_SPECS, landingScene, pairShown, searchBarLook, sessionGet, sessionSet, useLandingSettings, wheelSettings, type Shown } from "./settings";
import { SongWheel, type WheelHandle } from "./SongWheel";
import { isSortKey, newShuffleSeed, SHUFFLE_STORE, shuffleSongs, SORT_STORE, sortSongs, type SortKey } from "./sort";
import { useWheelLayout } from "./useWheelLayout";
import { prefetchRows } from "./wheel";

export type LandingSong = {
  slug: string;
  title: string;
  artist: string;
  aliases: string[];
  tags: string[];
  cover: { file: string; kind: "album" | "artist" };
  /** The song's 30-second preview, for the page's music; null if it has none. */
  preview: string | null;
  /** The year it first came out (the sort menu's Year order); null if not known. */
  year: number | null;
};


/**
 * The landing page: a wheel of song titles in the middle of the screen, over the resting song's album art filling the
 * window under the Fog effect (no writing on the glass), a bar round the centred song (a funnel opening the sort menu,
 * an arrow to open the song), the app's name, a 💧 to let a drop fall down the glass, a 🎲 to spin to a random song, and
 * music (the background song's preview) to switch on (placed as the design has them on desktops and on phones: see
 * Wordmark and icon.tsx LANDING_*); while developing, a Tune panel too.
 */
export function Landing({ songs: catalogue }: { songs: LandingSong[] }) {
  const router = useRouter();
  const tune = useLandingSettings();
  const typeface = useTypeface();
  // The catalogue shuffled for this visit (the Default order), and the wheel's songs in the order chosen in the sort
  // menu (remembered in this browser); every index below is into them.
  const [shuffled, setShuffled] = useState(catalogue);
  const [sort, setSort] = useState<SortKey>("default");
  const songs = useMemo(() => sortSongs(shuffled, sort), [shuffled, sort]);
  const titles = useMemo(() => songs.map((s) => s.title), [songs]);
  const wheel = wheelSettings(tune.settings.wheel);
  const look = searchBarLook(tune.settings.bar);
  const layout = useWheelLayout(titles, typeface.key, wheel, look);
  const wheelRef = useRef<WheelHandle>(null);
  // When the visitor last turned the wheel themselves (AutoRotate stops for a while after).
  const userAt = useRef(0);
  const onUser = () => void (userAt.current = performance.now());
  const box = layout.ready ? iconBox(look, layout.geo.centerSize) : null;
  // The wheel mounts once the starting song is known (it lives in sessionStorage, so not in the static HTML).
  const [start, setStart] = useState<number | null>(null);
  const [wanted, setWanted] = useState<number | null>(null); // where the wheel should be (rest)
  const [focus, setFocus] = useState<number | null>(null); // nearest the centre right now
  const [aim, setAim] = useState<number | null>(null); // where it's heading: drives the background
  const [arrived, setArrived] = useState<number | null>(null); // all but there: the background may change
  const [rested, setRested] = useState<number | null>(null); // where it came to rest
  const index = wanted ?? start ?? 0;
  const focused = focus ?? start ?? 0;
  const rest = rested ?? start ?? 0;
  const heading = aim ?? rest;

  useEffect(() => {
    // The order, the shuffle and the start position are only known after mount (localStorage and sessionStorage), and
    // together, so the wheel comes up already in order.
    let saved: unknown = null;
    try {
      saved = localStorage.getItem(SORT_STORE);
    } catch {
      // Blocked storage: the default order.
    }
    const order = isSortKey(saved) ? saved : "default";
    let seed = sessionGet(SHUFFLE_STORE);
    if (seed === null) sessionSet(SHUFFLE_STORE, (seed = newShuffleSeed()));
    const mixed = shuffleSongs(catalogue, seed);
    const slug = sessionGet(LANDING_FOCUS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setShuffled(mixed);
    setSort(order);
    setStart(Math.max(0, sortSongs(mixed, order).findIndex((s) => s.slug === slug)));
  }, [catalogue]);

  // A new order: the song in focus stays in focus (the wheel comes back up on it, now among other neighbours), and so
  // does the background. The list cross-fades in turn: a still copy of the old rows fades out, then the new ones fade
  // in (never both at once), the focused song and the bar staying put.
  const wheelBox = useRef<HTMLDivElement>(null);
  const ghostBox = useRef<HTMLDivElement>(null);
  const crossFade = useRef(false);
  useLayoutEffect(() => {
    if (!crossFade.current) return;
    crossFade.current = false;
    for (const row of wheelBox.current?.querySelectorAll<HTMLElement>("[data-row]:not([aria-selected='true'])") ?? []) {
      // Hidden until the old rows have gone, then up to its own opacity.
      row.animate([{ opacity: 0, offset: 0 }], { duration: FADE_IN_MS, delay: FADE_OUT_MS, easing: "ease-out", fill: "backwards" });
    }
  }, [sort]);
  const reorder = (next: SortKey) => {
    if (next === sort) return;
    onUser();
    const old = wheelBox.current?.querySelector("[role='listbox']");
    if (old && ghostBox.current) {
      fadeOutCopy(old, ghostBox.current);
      crossFade.current = true;
    }
    const nextSongs = sortSongs(shuffled, next);
    const at = (i: number) => nextSongs.indexOf(songs[i]);
    setSort(next);
    setStart(at(focused));
    setWanted(null);
    setFocus(null);
    setAim(null);
    setArrived(null);
    setRested(null);
    setShown((s) => s && { ...s, i: at(s.i) });
    try {
      localStorage.setItem(SORT_STORE, next);
    } catch {
      // Not remembered; fine.
    }
  };

  // The background moves to the song the wheel is heading for, song and cover together: its cover loads and its fog is
  // made while the wheel turns, and goes up as the wheel arrives (never for a song it only passes on the way).
  const coverOf = (i: number) => `/covers/${songs[i].cover.file}`;
  const art = useArtwork(coverOf(heading), songs[heading].cover.kind);
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    setShown((prev) => pairShown(prev, heading, art, (i) => `/covers/${songs[i].cover.file}`));
  }, [art, heading, songs]);
  const shownSong = shown ? songs[shown.i] : null;
  const song: Song | null = shownSong && { title: shownSong.title, artist: shownSong.artist, cover: `/covers/${shownSong.cover.file}`, coverKind: shownSong.cover.kind };
  // The backdrop is the site's one window (backdrops/Stage.tsx): the landing's pane on it, one for the whole visit, its
  // cover changing in place as the wheel rests.
  useStageScene(shown && song ? landingScene(song, tune.settings.fog, (arrived ?? rest) !== shown.i) : null);

  // Covers either side of the focused song load ahead, so wherever the wheel stops its background is ready sooner.
  const fetched = useRef(new Set<string>());
  useEffect(() => {
    for (const i of prefetchRows(focused, songs.length)) {
      const src = `/covers/${songs[i].cover.file}`;
      if (fetched.current.has(src)) continue;
      fetched.current.add(src);
      new Image().src = src;
    }
  }, [focused, songs]);

  // Opening a song: the cover starts moving to its place on the song page at once (backdrops/Stage.tsx), and the wheel
  // and buttons fade out before the page goes over.
  const stage = useStage();
  const [leaving, setLeaving] = useState(false);
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => void (gone.current = true); // gone already (Back): don't navigate after all
  }, []);
  const open = (i: number, newTab: boolean) => {
    const s = songs[i];
    const url = `/songs/${s.slug}/`;
    if (newTab) return void window.open(url, "_blank", "noopener");
    if (leaving) return;
    // The page changes once the wheel has faded and the cover is moving (its rendering then can't hold the move up).
    const target = { title: s.title, artist: s.artist, cover: `/covers/${s.cover.file}`, coverKind: s.cover.kind };
    // The song page's fog starts building now, under the moving cover, so it's ready to mist over as the cover lands.
    const moving = stage.leave({ mode: "song", song: target, scene: savedSongScene(s.slug, target) });
    setLeaving(true);
    void Promise.all([moving, new Promise((r) => window.setTimeout(r, TIMING.landingExit))]).then(() => !gone.current && router.push(url));
  };
  const onRest = (i: number) => {
    setRested(i);
    setWanted(i);
    sessionSet(LANDING_FOCUS_KEY, songs[i].slug);
    router.prefetch(`/songs/${songs[i].slug}/`); // so opening it goes over at once
  };
  // The whole page is the wheel's to touch (touch-none: no page scrolling, zooming or pull-to-refresh to fight with).
  return (
    <main className="fixed inset-0 touch-none overflow-hidden select-none">
      {/* Everything on the page fades up as it arrives (partway into the cover's move, coming from a song), and out on
          the way to one. */}
      <Entrance className="absolute inset-0">
        <div className={`absolute inset-0 transition-[opacity,scale] duration-200 ease-out ${leaving ? "pointer-events-none scale-[0.98] opacity-0" : ""}`}>
          <div ref={wheelBox} className="absolute inset-x-0 top-1/2 -translate-y-1/2">
            {/* The old order's rows fading out after a new one is chosen (filled in by fadeOutCopy, not React). */}
            <div ref={ghostBox} aria-hidden inert className="pointer-events-none absolute inset-0" />
            {start !== null && (
              // A new order brings the wheel up afresh on the same song.
              <SongWheel
                key={sort}
                titles={titles}
                index={index}
                settings={wheel}
                onFocus={setFocus}
                onAim={setAim}
                onArrive={setArrived}
                onRest={onRest}
                onOpen={open}
                onUser={onUser}
                layout={layout}
                bar={{ look, sort, onSort: reorder }}
                ref={wheelRef}
              />
            )}
          </div>

          {/* The emoji, placed for desktops and phones (icon.tsx LANDING_*). A drop: one of the big droplets on the glass
              falls, clearing a trail (backdrops/variants.tsx, FogHandle.drip). A random song. */}
          <EmojiButton emoji="💧" box={start !== null ? box : null} onClick={() => stage.drip("landing")} aria-label="Let a drop fall" title="Let a drop fall" className={LANDING_DROP} />
          <EmojiButton emoji="🎲" box={start !== null ? box : null} onClick={() => (onUser(), wheelRef.current?.roll())} aria-label="Random song" title="Random song" className={LANDING_DICE} />
          <BackgroundMusic src={shownSong ? shownSong.preview : undefined} box={box} />
          <Wordmark leaving={leaving} />
          <AutoRotate wheel={wheelRef} ready={start !== null && !leaving} song={rest} preview={songs[rest].preview} userAt={userAt} />
        </div>
      </Entrance>

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

/** A new order: how long the old list takes to fade out, and then the new one to fade in, ms. */
const FADE_OUT_MS = 160;
const FADE_IN_MS = 220;

/**
 * Puts a still copy of the wheel `listbox` into `into` and fades it out: its rows only, without the bar or the focused
 * song (the new wheel shows the same song in the same place), inert. A copy still fading from before goes at once.
 */
function fadeOutCopy(listbox: Element, into: HTMLElement) {
  into.replaceChildren();
  const copy = listbox.cloneNode(true) as HTMLElement;
  for (const attr of ["id", "role", "tabindex", "aria-label", "aria-activedescendant", "data-backdrop-ui"]) copy.removeAttribute(attr);
  for (const child of [...copy.children] as HTMLElement[]) {
    if (!child.hasAttribute("data-row") || child.getAttribute("aria-selected") === "true") child.remove();
    else {
      for (const attr of ["id", "role", "aria-selected", "aria-setsize", "aria-posinset", "data-row"]) child.removeAttribute(attr);
      child.style.pointerEvents = "none";
    }
  }
  into.append(copy);
  const fade = copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: "ease-in", fill: "forwards" });
  fade.onfinish = () => copy.remove();
}

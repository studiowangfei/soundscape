/**
 * The landing page's own Tune settings (Fog without the writing, the Wheel and its Search bar), saved apart from the
 * song pages' and seeded on the first visit from the Fog settings tuned there.
 */
import { useEffect, useState } from "react";
import { defaults, PARAMS, SEARCH_BAR_PARAMS, WHEEL_PARAMS, type Param, type Params } from "../backdrops/params";
import type { LoadedArt, Song } from "../backdrops/art";
import { WINDOW_SEED } from "../backdrops/fog-render";
import type { Scene } from "../backdrops/stage-model";
import type { WheelSettings } from "./wheel";

export const LANDING_STORE = "soundscape.landing.params";
const SONG_PAGES_STORE = "soundscape.backdrop.params";

export type LandingSettings = { fog: Params; wheel: Params; bar: Params };

/** Where the landing page's Fog looks different from the song pages' (as tuned on 2026-11-04; the first run 20 s in). */
const LANDING_FOG: Params = { blur: 10, dripFirst: 20, dripEvery: 60, edgeSoft: 0, brightness: 0.6, glow: 0.3, zoomSecs: 15 };

/** No finger-written title on this page (the titles are on the wheel); its own Fog defaults. */
export const LANDING_FOG_SPECS: Param[] = PARAMS.fog
  .filter((s: Param) => s.key !== "text" && s.when !== "text")
  .map((s) => (s.key in LANDING_FOG ? { ...s, value: LANDING_FOG[s.key] } : s));

/**
 * The landing page's scene on the backdrop stage, its one window with `song`'s cover behind: Landing shows it, and a song
 * page asks for it ahead as it closes. `hold`: keep the cover that's up (the wheel is passing other songs).
 */
export function landingScene(song: Song, fog: Params, hold = false): Scene {
  return { mode: "landing", key: "landing", song, variant: "fog", params: { ...fog, text: 0 }, layout: "fill", seed: WINDOW_SEED, hold };
}

/** The landing page's Fog settings before any tuning. */
export const landingFogDefaults = (): Params => ({ ...defaults(PARAMS.fog), ...LANDING_FOG, text: 0 });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numbersIn = (v: unknown): Params => (isObject(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "number")) : {}) as Params;
const settle = (fog: Params, wheel: Params, bar: Params = {}): LandingSettings => ({
  fog: { ...landingFogDefaults(), ...fog, text: 0 },
  wheel: { ...defaults(WHEEL_PARAMS), ...wheel },
  bar: { ...defaults(SEARCH_BAR_PARAMS), ...bar },
});

/** First visit: the song pages' saved settings (`soundscape.backdrop.params`) give the Fog part; defaults fill the rest. */
export function seedLanding(savedSongPages: unknown): LandingSettings {
  return settle(isObject(savedSongPages) ? numbersIn(savedSongPages.fog) : {}, {});
}

/**
 * Bumped when the wheel's settings change meaning or defaults, so wheel values saved before are set aside (4: the room
 * round the focused song in em of the text, no longer px).
 */
const WHEEL_VERSION = 4;
/** The same for the search bar's (2: sized as in the Figma design, node 196:2058; 3: its icons at 50%). */
const BAR_VERSION = 3;
const without = (values: Params, ...keys: string[]): Params => Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k)));

/**
 * The landing settings from what's saved: this page's own (wheel and bar values if current; from the version before,
 * all but those that changed), else seeded from the song pages'.
 */
export function readLanding(own: unknown, songPages: unknown): LandingSettings {
  if (!isObject(own)) return seedLanding(songPages);
  const wheel = numbersIn(own.wheel);
  const bar = numbersIn(own.bar);
  return settle(
    numbersIn(own.fog),
    own.wheelVersion === WHEEL_VERSION ? wheel : own.wheelVersion === 3 ? without(wheel, "focusGap") : {},
    own.barVersion === BAR_VERSION ? bar : own.barVersion === 2 ? without(bar, "searchOpacity", "arrowOpacity") : {},
  );
}

/** What's saved: only what differs from the defaults, so later changes to the defaults still reach you. */
export function toSaved(s: LandingSettings) {
  const changed = (values: Params, base: Params) => Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== base[k]));
  return {
    fog: changed(s.fog, landingFogDefaults()),
    wheel: changed(s.wheel, defaults(WHEEL_PARAMS)),
    wheelVersion: WHEEL_VERSION,
    bar: changed(s.bar, defaults(SEARCH_BAR_PARAMS)),
    barVersion: BAR_VERSION,
  };
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function useLandingSettings() {
  const [settings, setSettings] = useState<LandingSettings>(() => seedLanding(null));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setSettings(readLanding(read(LANDING_STORE), read(SONG_PAGES_STORE)));
  }, []);
  const save = (next: LandingSettings) => {
    setSettings(next);
    localStorage.setItem(LANDING_STORE, JSON.stringify(toSaved(next)));
  };
  return {
    settings,
    setFog: (key: string, value: number) => save({ ...settings, fog: { ...settings.fog, [key]: value } }),
    setWheel: (key: string, value: number) => save({ ...settings, wheel: { ...settings.wheel, [key]: value } }),
    setBar: (key: string, value: number) => save({ ...settings, bar: { ...settings.bar, [key]: value } }),
    reset: () => save(seedLanding(null)),
  };
}

/** The Wheel group's values (percentages in the panel) as the wheel's settings; anything missing comes from the defaults. */
export function wheelSettings(values: Params): WheelSettings {
  const p = { ...defaults(WHEEL_PARAMS), ...values };
  return { drum: p.drum / 100, spacing: p.spacing, focusGap: p.focusGap, falloff: p.falloff, longest: p.longest / 100, dim: p.dim };
}

/**
 * How the search bar round the centred song looks: px, em of the wheel's text, CSS rgb channels and 0–1 opacities. As in
 * the Figma design, the stroke is inside the outline and the padding is measured from the outline itself.
 */
export type SearchBarLook = {
  stroke: number;
  strokeColor: string;
  strokeOpacity: number;
  padX: number;
  padY: number;
  gap: number;
  /** Each icon's box, square, in em of the title (the drawing is 13/16 of it, as Phosphor draws it). */
  icon: number;
  iconColor: string;
  searchOpacity: number;
  arrowOpacity: number;
};

/**
 * On narrow screens (phones held upright) the bar's side padding and the gaps between icons and text are set in px: in
 * em of the type there, they'd take width the titles need. Measured to the icons' boxes, like the design's; the drawings
 * sit a few px inside them. The padding above and below the icons is the same as at the sides.
 */
export const COMPACT_BAR = { padX: 10, gap: 16 };

/**
 * Every icon's box on the site, px, for the wheel's centre text size `size`: the search bar's two, and the corner ones
 * (music, Close) drawn as big (see components/icon.tsx). One size for every title, however a long one is set to fit.
 */
export const iconBox = (look: SearchBarLook, size: number) => look.icon * size;

/** The text's line, in em (the Figma design's 60 px at 48 px): the bar is never shorter than this plus its padding. */
const LINE = 60 / 48;

/**
 * The bar's side padding, icon size, the gaps between text and icons, and its height (the icons or the text's line,
 * whichever is taller, plus the padding above and below), in px, at the wheel's text size `size`.
 */
export function barParts(look: SearchBarLook, size: number, compact: boolean) {
  const icon = iconBox(look, size);
  const inner = Math.max(icon, LINE * size);
  return compact
    ? { ...COMPACT_BAR, icon, height: inner + 2 * COMPACT_BAR.padX }
    : { padX: look.padX * size, icon, gap: look.gap * size, height: inner + 2 * look.padY * size };
}

/** How much wider the bar is than the text in it: `em` of the wheel's text plus `px` (compact padding and gaps). */
export function barChromeOf(look: SearchBarLook, compact: boolean) {
  const icons = 2 * look.icon;
  const c = COMPACT_BAR;
  return compact ? { em: icons, px: 2 * (c.padX + c.gap) } : { em: 2 * (look.padX + look.gap) + icons, px: 0 };
}

/** The Search bar group's values as its look; anything missing comes from the defaults. */
export function searchBarLook(values: Params): SearchBarLook {
  const p = { ...defaults(SEARCH_BAR_PARAMS), ...values };
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(" ");
  return {
    stroke: p.stroke,
    strokeColor: rgb(p.strokeColor),
    strokeOpacity: p.strokeOpacity / 100,
    padX: p.padX,
    padY: p.padY,
    gap: p.gap,
    icon: p.icon,
    iconColor: rgb(p.iconColor),
    searchOpacity: p.searchOpacity / 100,
    arrowOpacity: p.arrowOpacity / 100,
  };
}

/** What the background shows: a song and its loaded cover, always together. */
export type Shown = { i: number; art: LoadedArt };

/**
 * The background moves to a song (where the wheel is heading) only once its cover has loaded, so it never pairs one
 * song with another's cover.
 */
export function pairShown(prev: Shown | null, to: number, art: LoadedArt | null, coverOf: (i: number) => string): Shown | null {
  if (!art || art.src !== coverOf(to)) return prev;
  return prev && prev.i === to && prev.art === art ? prev : { i: to, art };
}

/**
 * The session key for the song the landing wheel shows when you come back: where it last rested, or the song page you
 * closed (its X sets it).
 */
export const LANDING_FOCUS_KEY = "soundscape.landing.focus";

/** sessionStorage, but blocked storage (privacy settings) just means nothing is remembered. */
export function sessionGet(key: string, storage: Storage = globalThis.sessionStorage): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
export function sessionSet(key: string, value: string, storage: Storage = globalThis.sessionStorage) {
  try {
    storage.setItem(key, value);
  } catch {
    // Not remembered; fine.
  }
}

/** The arrow keys (and Enter) drive the wheel when nothing else has focus, so it needs no focus ring on load. */
export function wheelOwnsKeys(active: { tagName: string } | null): boolean {
  return !active || active.tagName === "BODY";
}

/**
 * The landing page's own Tune settings (Fog without the writing, the Wheel and its Search bar), saved apart from the
 * song pages' and seeded on the first visit from the Fog settings tuned there.
 */
import { useEffect, useState } from "react";
import { defaults, PARAMS, SEARCH_BAR_PARAMS, WHEEL_PARAMS, type Param, type Params } from "../backdrops/params";
import type { LoadedArt } from "../backdrops/art";
import type { WheelSettings } from "./wheel";

export const LANDING_STORE = "soundscape.landing.params";
const SONG_PAGES_STORE = "soundscape.backdrop.params";

export type LandingSettings = { fog: Params; wheel: Params; bar: Params };

/** Where the landing page's Fog looks different from the song pages' (as tuned on 2026-10-30). */
const LANDING_FOG: Params = { density: 0, opacity: 0.16, refraction: 6, refog: 20, thicken: 80, thickMax: 0.75, dripEvery: 10, zoomSecs: 15 };

/** No finger-written title on this page (the titles are on the wheel); its own Fog defaults. */
export const LANDING_FOG_SPECS: Param[] = PARAMS.fog
  .filter((s: Param) => s.key !== "text" && s.when !== "text")
  .map((s) => (s.key in LANDING_FOG ? { ...s, value: LANDING_FOG[s.key] } : s));

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

/** Bumped when the wheel's settings change meaning or defaults, so wheel values saved before are set aside. */
const WHEEL_VERSION = 3;

/** The landing settings from what's saved: this page's own (wheel values only if current), else seeded from the song pages'. */
export function readLanding(own: unknown, songPages: unknown): LandingSettings {
  if (!isObject(own)) return seedLanding(songPages);
  return settle(numbersIn(own.fog), own.wheelVersion === WHEEL_VERSION ? numbersIn(own.wheel) : {}, numbersIn(own.bar));
}

/** What's saved: only what differs from the defaults, so later changes to the defaults still reach you. */
export function toSaved(s: LandingSettings) {
  const changed = (values: Params, base: Params) => Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== base[k]));
  return {
    fog: changed(s.fog, landingFogDefaults()),
    wheel: changed(s.wheel, defaults(WHEEL_PARAMS)),
    wheelVersion: WHEEL_VERSION,
    bar: changed(s.bar, defaults(SEARCH_BAR_PARAMS)),
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

/** How the search bar round the centred song looks: px, em of the wheel's text, CSS rgb channels and 0–1 opacities. */
export type SearchBarLook = {
  stroke: number;
  strokeColor: string;
  strokeOpacity: number;
  padX: number;
  padY: number;
  gap: number;
  /** The icons' height, as a multiple of the title's capitals. */
  iconHeight: number;
  iconColor: string;
  searchOpacity: number;
  arrowOpacity: number;
};

/**
 * On narrow screens (phones held upright) the bar's padding, icons and gaps are set in px: in em of the small type
 * there, the icons would be too small to see or tap, and the padding would take width the titles need.
 */
export const COMPACT_BAR = { padX: 12, gap: 10 };

/** The icons' width for their height (SearchBar draws each in a box that hugs its stroke). */
export const ICON_ASPECT = { search: 1, arrow: 18.75 / 15.75 };
/** A serif's capital height in em, for when the typeface can't be measured. */
export const CAP_EM = 0.7;

/**
 * The bar's side padding, icon height and the gaps between text and icons, in px, at type size `size`. The icons are as
 * tall as the title's capitals, `capPx`, times Icon size, on every screen.
 */
export function barParts(look: SearchBarLook, size: number, compact: boolean, capPx = CAP_EM * size) {
  const icon = look.iconHeight * capPx;
  return compact ? { ...COMPACT_BAR, icon } : { padX: look.padX * size, icon, gap: look.gap * size };
}

/**
 * How much wider the bar is than the text in it: `em` of the wheel's text plus `px` (the stroke; compact padding and
 * gaps). `capEm` is the title's capital height in em.
 */
export function barChromeOf(look: SearchBarLook, compact: boolean, capEm = CAP_EM) {
  const icons = look.iconHeight * capEm * (ICON_ASPECT.search + ICON_ASPECT.arrow);
  const c = COMPACT_BAR;
  return compact ? { em: icons, px: 2 * (c.padX + c.gap + look.stroke) } : { em: 2 * (look.padX + look.gap) + icons, px: 2 * look.stroke };
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
    iconHeight: p.iconHeight,
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

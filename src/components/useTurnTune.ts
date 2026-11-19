"use client";

import { useEffect, useState } from "react";
import type { TuneSection } from "./backdrops/Backdrop";
import type { Param } from "./backdrops/params";

/** How far (px) a song's backdrop drifts as it turns to the next or previous song (Stage.tsx, stage-model.ts driftPath). */
export const DRIFT: Param = { key: "drift", label: "Backdrop drift", min: 0, max: 80, step: 2, value: 24, unit: "px" };
/** How far (px) the player's cover drifts as it turns with the backdrop (player/PlayerCover.tsx). */
export const COVER_DRIFT: Param = { key: "coverDrift", label: "Player cover drift", min: 0, max: 24, step: 1, value: 8, unit: "px" };
const STORE = "soundscape.turn.drift";
const COVER_STORE = "soundscape.turn.coverDrift";

/** A setting remembered in this browser (`key` in localStorage), within `spec`'s range. */
function useSaved(key: string, spec: Param): [number, (v: number) => void] {
  const [value, setValue] = useState(spec.value);
  useEffect(() => {
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(key) ?? NaN);
    } catch {
      // Blocked storage: the default it is.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    if (Number.isFinite(saved)) setValue(Math.min(spec.max, Math.max(spec.min, saved)));
  }, [key, spec]);
  const set = (v: number) => {
    setValue(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      // Not remembered; fine.
    }
  };
  return [value, set];
}

/**
 * The drifts on a song change: what's set (remembered in this browser) and the Tune panel's "Song change" group: the
 * backdrop's, and with `cover`, the player's cover's. `store` and `title`: another drift of its own (the landing page's
 * drift trial, landing/drift-trial.ts).
 */
export function useTurnTune({ store = STORE, title = "Song change", cover = false }: { store?: string; title?: string; cover?: boolean } = {}): { drift: number; coverDrift: number; section: TuneSection } {
  const [drift, setDrift] = useSaved(store, DRIFT);
  const [coverDrift, setCoverDrift] = useSaved(COVER_STORE, COVER_DRIFT);
  const section: TuneSection = {
    title,
    specs: cover ? [DRIFT, COVER_DRIFT] : [DRIFT],
    values: { drift, coverDrift },
    onParam: (key, v) => (key === COVER_DRIFT.key ? setCoverDrift : setDrift)(v),
    onReset: () => {
      setDrift(DRIFT.value);
      if (cover) setCoverDrift(COVER_DRIFT.value);
    },
  };
  return { drift, coverDrift, section };
}

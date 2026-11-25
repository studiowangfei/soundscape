"use client";

import { useEffect, useState } from "react";
import type { TuneSection } from "../backdrops/Backdrop";
import {
  DEFAULT_MOBILE_CARD,
  DEFAULT_MOBILE_PLAYER,
  MOBILE_CARD_PARAM,
  MOBILE_CARD_STORE,
  MOBILE_PLAYER_PARAM,
  MOBILE_PLAYER_STORE,
  mobileCardAt,
  mobileCardIndex,
  mobilePlayerAt,
  mobilePlayerIndex,
  readMobileCard,
  readMobilePlayer,
  type MobileCard,
  type MobilePlayer,
} from "./variants";

/** A choice remembered in this browser (`store` in localStorage): the default until it's read, then what was saved. */
function useSavedChoice<K extends string>(store: string, fallback: K, read: (saved: unknown) => K): [K, (next: K) => void] {
  const [value, setValue] = useState<K>(fallback);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(store);
    } catch {
      // Blocked storage: the default it is.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setValue(read(saved));
  }, [store, read]);
  const choose = (next: K) => {
    setValue(next);
    try {
      localStorage.setItem(store, next);
    } catch {
      // Not remembered; fine.
    }
  };
  return [value, choose];
}

/**
 * The cards on phones: the collapsed cards' variant and where the player sits, above them or below (both remembered in
 * this browser), and the Tune panel's "Cards" group.
 */
export function useMobileCard(): { variant: MobileCard; player: MobilePlayer; section: TuneSection } {
  const [variant, setVariant] = useSavedChoice(MOBILE_CARD_STORE, DEFAULT_MOBILE_CARD, readMobileCard);
  const [player, setPlayer] = useSavedChoice(MOBILE_PLAYER_STORE, DEFAULT_MOBILE_PLAYER, readMobilePlayer);
  const section: TuneSection = {
    title: "Cards",
    specs: [MOBILE_CARD_PARAM, MOBILE_PLAYER_PARAM],
    values: { mobileCard: mobileCardIndex(variant), mobilePlayer: mobilePlayerIndex(player) },
    onParam: (key, v) => (key === MOBILE_PLAYER_PARAM.key ? setPlayer(mobilePlayerAt(v)) : setVariant(mobileCardAt(v))),
  };
  return { variant, player, section };
}

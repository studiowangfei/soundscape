"use client";

import { useEffect, useState } from "react";
import type { TuneSection } from "../backdrops/Backdrop";
import { DEFAULT_MOBILE_CARD, MOBILE_CARD_PARAM, MOBILE_CARD_STORE, mobileCardAt, mobileCardIndex, readMobileCard, type MobileCard } from "./variants";

/** The collapsed cards' variant on phones: what's chosen (remembered in this browser) and the Tune panel's "Cards" group. */
export function useMobileCard(): { variant: MobileCard; section: TuneSection } {
  const [variant, setVariant] = useState<MobileCard>(DEFAULT_MOBILE_CARD);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MOBILE_CARD_STORE);
    } catch {
      // Blocked storage: the default it is.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setVariant(readMobileCard(saved));
  }, []);
  const choose = (next: MobileCard) => {
    setVariant(next);
    try {
      localStorage.setItem(MOBILE_CARD_STORE, next);
    } catch {
      // Not remembered; fine.
    }
  };
  const section: TuneSection = { title: "Cards", specs: [MOBILE_CARD_PARAM], values: { mobileCard: mobileCardIndex(variant) }, onParam: (_, v) => choose(mobileCardAt(v)) };
  return { variant, section };
}

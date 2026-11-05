/**
 * The collapsed cards' variants on phones, picked in Tune → Cards and remembered in this browser. Wider screens always
 * have Standard. Pure, so it's tested in Node; the React side is useMobileCard.
 */
import type { Param } from "../backdrops/params";

export const MOBILE_CARD_STORE = "soundscape.mobileCard";

/** Standard is the design's card; Short (the Figma "Mobile-short card") drops the story and the content headline. */
export const MOBILE_CARDS = [
  { key: "standard", label: "Standard (250 × 250)" },
  { key: "short", label: "Short (250 × 182)" },
] as const;

export type MobileCard = (typeof MOBILE_CARDS)[number]["key"];

/** What phones show unless Tune says otherwise (chosen 2026-11-04). */
export const DEFAULT_MOBILE_CARD: MobileCard = "short";

export const MOBILE_CARD_PARAM: Param = {
  key: "mobileCard",
  label: "Cards on phones",
  min: 0,
  max: MOBILE_CARDS.length - 1,
  step: 1,
  value: MOBILE_CARDS.findIndex((c) => c.key === DEFAULT_MOBILE_CARD),
  options: MOBILE_CARDS.map((c) => c.label),
  radio: true,
};

/** The saved variant if it's one there is, else the default (Short). */
export const readMobileCard = (saved: unknown): MobileCard => MOBILE_CARDS.find((c) => c.key === saved)?.key ?? DEFAULT_MOBILE_CARD;

export const mobileCardIndex = (key: MobileCard) => MOBILE_CARDS.findIndex((c) => c.key === key);
export const mobileCardAt = (i: number): MobileCard => MOBILE_CARDS[Math.round(i)]?.key ?? DEFAULT_MOBILE_CARD;

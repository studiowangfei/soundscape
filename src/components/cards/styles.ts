// The cards' type, shared by the tiles (CardTile, VisitorFaces), the open card (CardDetail) and the end card's form.

// A tile: a 9px capital label, Libre Baskerville headlines, SF body text. Secondary text is translucent white rather
// than the design's fixed greys: the same on dark glass, still legible on light glass.
export const TILE_LABEL = "text-[9px] leading-[9px] font-semibold tracking-[0.8px] text-white/55 uppercase";
export const TILE_HEADLINE = "font-serif text-[18px] leading-[26px] text-white";

// The open card, as the design sets it: a 12px capital label, a 25px headline, 18px body text, in its greys.
export const DETAIL_LABEL = "text-[12px] leading-[14px] font-semibold tracking-[1.2px] text-[#888] uppercase";
export const DETAIL_HEADLINE = "font-serif text-[25px] leading-[34px] text-white";
export const DETAIL_BODY = "text-[18px] leading-[26px] text-[#bbb]";

/** A comment as the design quotes it on a tile: “ text ”. */
export const quoted = (s: string) => `“ ${s.trim()} ”`;

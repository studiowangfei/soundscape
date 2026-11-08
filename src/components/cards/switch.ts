/**
 * Moving from an open card to the one beside it (arrow keys, a sideways swipe): the two sit side by side, a card-width
 * apart, and slide along together in one move, each fading by how far it is from the middle (so the one going out is
 * gone as it comes to rest beside the window's middle). Pure, so it's tested in Node; CardDetail runs it.
 */

/** How far along the next card waits (px): a card's width and the gap between the two. */
export const pagerStep = (width: number) => width + 24;

/** A card's opacity `x` px from the middle: solid there, gone a whole step along. */
export const pagerFade = (x: number, step: number) => Math.min(1, Math.max(0, 1 - Math.abs(x) / step));

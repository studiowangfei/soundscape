import type { EntryCard } from "@/content/schema";
import type { VisitorComment } from "@/content/visitors";
import { END_PROMPT, ROW_LABEL, TYPE_LABEL } from "./meta";

/** An approved visitor comment, as a card in the row. */
export type VisitorCard = { id: string; type: "visitor"; comment: VisitorComment };
/** The last card in the row: where a visitor leaves their own comment on `song`. */
export type EndCard = { id: "visitor-end"; type: "end"; song: string };
/** A card in a song's row: one of the entry's own, a visitor's, or the end card. */
export type RowCard = EntryCard | VisitorCard | EndCard;

export const isEntryCard = (c: RowCard): c is EntryCard => c.type !== "visitor" && c.type !== "end";

/** The row: the entry's cards as they are, then visitors' comments newest first (the later id first on the same day),
 * then the end card. */
export function rowCards(cards: EntryCard[], visitors: VisitorComment[], song: string): RowCard[] {
  const newestFirst = [...visitors].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return [
    ...cards,
    ...newestFirst.map((comment): VisitorCard => ({ id: `visitor-${comment.id}`, type: "visitor", comment })),
    { id: "visitor-end", type: "end", song },
  ];
}

/** A card's name for screen readers: its label and what it says. */
export function rowCardLabel(card: RowCard): string {
  if (card.type === "visitor") return `${ROW_LABEL.visitor}: ${card.comment.text} (${card.comment.name ?? "Anonymous"})`;
  if (card.type === "end") return `${ROW_LABEL.end}: ${END_PROMPT}`;
  const what = card.type === "comment" ? card.snippet : card.type === "lyric" && card.lyric ? card.lyric.excerptOrTimestamp : card.headline;
  return `${TYPE_LABEL[card.type]}: ${what}`;
}

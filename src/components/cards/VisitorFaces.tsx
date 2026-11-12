import type { VisitorComment } from "@/content/visitors";
import { VisitorAttribution } from "./Attribution";
import { END_PROMPT, ROW_LABEL } from "./meta";
import { quoted, TILE_HEADLINE, TILE_LABEL } from "./styles";

/**
 * A visitor's comment on its tile, laid out as a People say tile: the label, the comment quoted (five lines at most;
 * three on the short phone card), and at the foot, where People say names its source, Soundscape's mark and
 * "Soundscape · name" (or Anonymous).
 */
export function VisitorTileFace({ comment, short = false }: { comment: VisitorComment; short?: boolean }) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 flex flex-col gap-4 px-5 pt-5">
        <p className={TILE_LABEL}>{ROW_LABEL.visitor}</p>
        <p className={`line-clamp-5 whitespace-pre-line ${TILE_HEADLINE} ${short ? "phone:line-clamp-3" : ""}`}>{quoted(comment.text)}</p>
      </div>
      <div className="absolute bottom-5 left-5 w-[210px]">
        <VisitorAttribution comment={comment} />
      </div>
    </>
  );
}

/**
 * The end card's tile: its label where every card has it, and what it asks (in italics, here and opened) centred
 * up and down in the card, as a lyric tile centres its line.
 */
export function EndTileFace() {
  return (
    <>
      <p className={`absolute top-5 left-5 w-[210px] ${TILE_LABEL}`}>{ROW_LABEL.end}</p>
      <div className="absolute inset-x-5 top-12 bottom-12 flex items-center">
        <p className={`${TILE_HEADLINE} italic`}>{END_PROMPT}</p>
      </div>
    </>
  );
}

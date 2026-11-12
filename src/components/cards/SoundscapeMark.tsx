import { useId } from "react";

/** The favicon's S (app/icon.svg): Libre Baskerville's, as an outline, in font units, centred on (324.5, 385), 790 tall. */
export const SOUNDSCAPE_S =
  "M73 11L58 235L95 235Q109 144 170.5 92.5Q232 41 322 41Q396 41 439 76.5Q482 112 482 171Q482 205 466.5 231.5Q451 258 413 283Q375 308 307 337Q224 374 176.5 407Q129 440 109.5 478.5Q90 517 90 568Q90 630 118.5 678Q147 726 197.5 753Q248 780 314 780Q398 780 473 721L499 766L522 766L533 567L496 567Q472 649 426.5 689Q381 729 317 729Q256 729 220 698.5Q184 668 184 618Q184 587 198.5 562Q213 537 246.5 514.5Q280 492 337 466Q436 422 491.5 385Q547 348 569 309Q591 270 591 217Q591 150 556.5 99Q522 48 461 19Q400 -10 319 -10Q262 -10 216.5 6.5Q171 23 124 60L96 11L73 11Z";

/** The S, `height` of the disc tall, in the middle of a 512 disc. */
function S({ height, fill }: { height: number; fill: string }) {
  const k = (height * 512) / 790;
  return <path d={SOUNDSCAPE_S} fill={fill} transform={`translate(256 256) scale(${k} ${-k}) translate(-324.5 -385)`} />;
}

/**
 * Soundscape's mark, where a card names its source (a visitor's comment is signed as the site's own). Opened, the
 * favicon as the source icons are drawn there: a white disc 24px across with the S in black, larger than the favicon's
 * so it reads at this size. On the tile, as the tiles draw a mark: 16px, one colour (the text's), a disc with the S cut
 * out, as a solid icon's logo is there.
 */
export function SoundscapeMark({ expanded = false }: { expanded?: boolean }) {
  const cut = useId();
  return expanded ? (
    <svg viewBox="0 0 512 512" aria-hidden className="size-6 shrink-0">
      <circle cx="256" cy="256" r="256" fill="#fff" />
      <S height={0.6} fill="#000" />
    </svg>
  ) : (
    <svg viewBox="0 0 512 512" aria-hidden className="size-4 shrink-0">
      <mask id={cut}>
        <circle cx="256" cy="256" r="256" fill="#fff" />
        <S height={0.66} fill="#000" />
      </mask>
      <circle cx="256" cy="256" r="256" fill="currentColor" mask={`url(#${cut})`} />
    </svg>
  );
}

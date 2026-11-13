import { cjkRuns } from "./typeface";

/**
 * Text whose Chinese characters are set Medium (500) while everything else keeps the element's own weight (user,
 * 2026-11-12): each run of Chinese characters gets its own span. Used for the landing wheel's titles and the cards'
 * body text (stories, context, spoiler text), so Chinese reads as firmly as the Latin beside it; Latin text in them is
 * unchanged. Comments (quotes, replies, visitors' comments) stay at their own weight.
 * Each Chinese typeface uses its nearest face: Medium where it has one (Noto Serif SC, PingFang SC), else Regular.
 */
export function CjkMedium({ text }: { text: string }) {
  return (
    <>
      {cjkRuns(text).map((r, i) =>
        r.cjk ? (
          <span key={i} className="font-medium">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
    </>
  );
}

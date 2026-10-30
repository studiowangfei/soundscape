import type { CardType } from "@/content/schema";

/** The label at the top of each card (set in capitals), as the design names the three kinds. */
export const TYPE_LABEL: Record<CardType, string> = {
  background: "Background",
  comment: "People say",
  version: "Content",
  film: "Content",
  lyric: "Lyric",
};

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1) || null;
    return u.hostname.includes("youtube.com") ? u.searchParams.get("v") : null;
  } catch {
    return null;
  }
}

/**
 * Where a YouTube link starts playing, in seconds: its `t` or `start` (query or hash), written as plain seconds
 * ("1566", "1566s") or as "1h2m3s". 0 for none. (A version card links a long set at the moment the song plays.)
 */
export function startSeconds(url: string): number {
  let raw: string | null = null;
  try {
    const u = new URL(url);
    raw = u.searchParams.get("t") ?? u.searchParams.get("start") ?? new URLSearchParams(u.hash.slice(1)).get("t");
  } catch {
    return 0;
  }
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m && m[0] ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
}

/** hqdefault exists for every video; object-cover at 16:9 crops its letterbox bars. */
export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  if (!m) return String(y);
  const date = new Date(Date.UTC(y, m - 1, day || 1));
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", ...(day ? { day: "numeric" } : {}), timeZone: "UTC" });
}

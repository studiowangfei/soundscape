// The end card's form, apart from how it looks: sending a comment, keeping a draft, and keeping keys and touches that
// belong to its fields away from the open card's own (moving between cards, closing).

/** What a visitor has written, and when they started writing it (their first keystroke, ms since the epoch). */
export type Draft = { text: string; name: string; startedAt?: number };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const FAILED = "Something went wrong. Try again in a moment.";
/** The server takes a comment sent sooner than this after it was begun for a bot's (visitors/submission.ts). */
const MIN_ELAPSED_MS = 3000;
const EMPTY: Draft = { text: "", name: "" };
const draftKey = (song: string) => `soundscape.visitorDraft.${song}`;
const session = (): Storage | null => (typeof sessionStorage === "undefined" ? null : sessionStorage);

/**
 * Sends a comment on `song` to the site (app/api/visitor-comments): what they wrote, the hidden field (`website`, empty
 * unless a bot filled it in) and how long they've been writing it (from the draft's first keystroke, which a reopened
 * card keeps; else from when the form opened). Sent sooner than a person could (a pasted comment), it waits out the rest
 * first, so it's never dropped as a bot's. The server's message when it turns the comment away; a try-again otherwise.
 */
export async function sendComment(
  song: string,
  draft: Draft & { website?: string },
  openedAt: number,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ ok: true } | { ok: false; message: string }> {
  let elapsed = now - (draft.startedAt ?? openedAt);
  if (elapsed < MIN_ELAPSED_MS) {
    await sleep(MIN_ELAPSED_MS - elapsed);
    elapsed = MIN_ELAPSED_MS;
  }
  try {
    const res = await fetchImpl("/api/visitor-comments/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song, text: draft.text, name: draft.name, website: draft.website ?? "", elapsedMs: elapsed }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, message: typeof body?.error === "string" ? body.error : FAILED };
  } catch {
    return { ok: false, message: FAILED };
  }
}

const isField = (target: EventTarget | null) => {
  const tag = (target as { tagName?: string } | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
};

/** Whether a key pressed in a field is the field's: the arrows move its caret, Escape leaves it (a second one closes). */
export const keyStaysInForm = (e: { target: EventTarget | null; key: string }) =>
  isField(e.target) && (e.key === "Escape" || e.key.startsWith("Arrow"));

/** Whether a touch starts in a field (selecting, scrolling its text), where it isn't a swipe to the next card. */
export const startsInField = (target: EventTarget | null) =>
  !!(target as { closest?: (s: string) => unknown } | null)?.closest?.("input, textarea");

/** What was written on `song` and not sent yet: kept while the page is open (and across a reload). */
export function loadDraft(song: string, storage: Storage | null = session()): Draft {
  try {
    const d = JSON.parse(storage?.getItem(draftKey(song)) ?? "null") as Partial<Draft> | null;
    const draft: Draft = { text: typeof d?.text === "string" ? d.text : "", name: typeof d?.name === "string" ? d.name : "" };
    return typeof d?.startedAt === "number" ? { ...draft, startedAt: d.startedAt } : draft;
  } catch {
    return EMPTY;
  }
}

export function saveDraft(song: string, draft: Draft, storage: Storage | null = session()) {
  try {
    storage?.setItem(draftKey(song), JSON.stringify(draft));
  } catch {} // storage full or blocked: the draft just isn't kept
}

export function clearDraft(song: string, storage: Storage | null = session()) {
  try {
    storage?.removeItem(draftKey(song));
  } catch {}
}

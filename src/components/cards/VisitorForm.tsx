"use client";

import { useRef, useState, type FormEvent } from "react";
import { clearDraft, loadDraft, saveDraft, sendComment, type Draft } from "./form";
import { END_PROMPT, ROW_LABEL } from "./meta";
import { DETAIL_BODY, DETAIL_HEADLINE, DETAIL_LABEL } from "./styles";

/** The most a comment may say (characters as people count them), and where the count starts showing. */
const MAX = 600;
const COUNT_FROM = 500;

// The fields sit on the card's glass: no boxes, the open card's body text over a hairline that brightens on focus.
const FIELD =
  "w-full border-0 border-b border-white/15 bg-transparent pb-2 text-[18px] leading-[26px] text-white/85 outline-none transition-colors placeholder:text-white/35 focus:border-white/45";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * The end card, opened: where a visitor leaves their comment on `song`, and a name or signature if they like (left
 * blank, it's anonymous). It goes to the site's owner to approve (a pull request, app/api/visitor-comments) and shows
 * on the page once approved. What they've written is kept until it's sent, so closing the card or swiping away loses
 * nothing.
 */
export function VisitorForm({ song }: { song: string }) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(song));
  const [state, setState] = useState<State>({ kind: "idle" });
  const [openedAt] = useState(() => Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const length = [...draft.text.trim()].length;
  const sending = state.kind === "sending";

  const update = (edit: Draft) => {
    // Writing starts with the first character (kept with the draft, so a reopened card still knows).
    const next = edit.text && !edit.startedAt ? { ...edit, startedAt: Date.now() } : edit;
    setDraft(next);
    saveDraft(song, next);
    if (state.kind === "error") setState({ kind: "idle" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || length === 0 || length > MAX) return;
    setState({ kind: "sending" });
    const result = await sendComment(song, { ...draft, website: honeypot.current?.value ?? "" }, openedAt);
    if (result.ok) {
      clearDraft(song);
      setState({ kind: "sent" });
    } else setState({ kind: "error", message: result.message });
  };

  return (
    <div className="flex flex-1 flex-col gap-5 px-8 pt-8 pb-8">
      <p className={DETAIL_LABEL}>{ROW_LABEL.end}</p>
      <h2 className={`${DETAIL_HEADLINE} italic`}>{END_PROMPT}</h2>
      {state.kind === "sent" ? (
        <p role="status" className={DETAIL_BODY}>
          Thanks. It&rsquo;ll show up here once it&rsquo;s approved.
        </p>
      ) : (
        <form onSubmit={submit} className="relative flex flex-1 flex-col gap-6" noValidate>
          <div className="flex flex-col gap-1">
            <textarea
              aria-label="Write anything"
              placeholder="Write anything"
              rows={4}
              value={draft.text}
              onChange={(e) => update({ ...draft, text: e.target.value })}
              className={`${FIELD} resize-none`}
            />
            {length > COUNT_FROM && (
              <p className={`self-end text-[13px] ${length > MAX ? "text-[#e88]" : "text-white/45"}`}>
                {length}/{MAX}
              </p>
            )}
          </div>
          <input
            aria-label="Name (optional)"
            placeholder="Name (optional)"
            maxLength={40}
            value={draft.name}
            onChange={(e) => update({ ...draft, name: e.target.value })}
            className={FIELD}
          />
          {/* For bots only: people never see or reach it, so anything typed here marks the comment as a bot's. */}
          <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-px w-px opacity-0" />
          <div className="mt-auto flex items-center justify-between gap-4">
            <p className="text-[14px] text-white/45">Comments appear once reviewed.</p>
            <button
              type="submit"
              disabled={sending || length === 0 || length > MAX}
              className="shrink-0 rounded-full bg-white/15 px-5 py-2 text-[16px] text-white transition-colors hover:bg-white/25 disabled:opacity-40 disabled:hover:bg-white/15"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {state.kind === "error" && (
            <p role="alert" className="-mt-2 text-[14px] text-[#e88]">
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

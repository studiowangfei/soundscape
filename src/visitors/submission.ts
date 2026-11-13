import { newCommentId, type VisitorComment } from "../content/visitors";
import { hasBlockedWord } from "./blocked-words";

/** What the end card's form posts. `website` is a field people never see (a bot fills it in). */
export type Submission = { song: string; text: string; name?: string; website?: string; elapsedMs: number };

export type Verdict =
  | { kind: "ok"; song: string; text: string; name: string | null }
  // Answered as a success, so a bot learns nothing, but no pull request is opened.
  | { kind: "bot" }
  | { kind: "invalid"; message: string };

/** The fastest a person writes and sends a comment, from the moment the form opened. */
const MIN_ELAPSED_MS = 3000;
// Links are welcome in the text (clickable on the open card) but not in the name, which signs it.
const LINK = /https?:\/\/|www\./i;
// Names are published (on the card and in the public repo), so an email address is kept out of them.
const EMAIL = /[^\s@()<>]+@[^\s@()<>]+\.[a-z]{2,}/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const codePoints = (s: string) => [...s].length;
const invalid = (message: string): Verdict => ({ kind: "invalid", message });

/** Whether a submission can become a pull request; the messages are shown to the visitor as they are. */
export function checkSubmission(body: unknown): Verdict {
  if (!body || typeof body !== "object") return invalid("Something went wrong. Try again in a moment.");
  const b = body as Record<string, unknown>;
  if ((typeof b.website === "string" && b.website !== "") || typeof b.elapsedMs !== "number" || b.elapsedMs < MIN_ELAPSED_MS) return { kind: "bot" };
  if (typeof b.song !== "string" || !SLUG.test(b.song)) return invalid("Unknown song.");
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!text) return invalid("Write something first.");
  if (codePoints(text) > 600) return invalid("That's a bit long: 600 characters at most.");
  if (codePoints(name) > 40) return invalid("Names are 40 characters at most.");
  if (LINK.test(name)) return invalid("Just a name, please: no links.");
  if (EMAIL.test(name)) return invalid("Just a name, please: no email addresses.");
  if (hasBlockedWord(text) || hasBlockedWord(name)) return invalid("This comment can't be posted.");
  return { kind: "ok", song: b.song, text, name: name || null };
}

/** The comment file for an accepted submission: a new id and the day it was sent (UTC). */
export function toComment(v: Extract<Verdict, { kind: "ok" }>, now: Date, random?: () => number): VisitorComment {
  return { id: newCommentId(now, random), song: v.song, text: v.text, name: v.name, date: now.toISOString().slice(0, 10) };
}

/** The pull request that proposes one comment: its branch, its one file, and a title and body to read it by. */
export function pullRequestFor(c: VisitorComment, songTitle: string, siteUrl = "") {
  const chars = [...c.text];
  const excerpt = chars.length > 60 ? `${chars.slice(0, 60).join("")}…` : c.text;
  const page = `${siteUrl.replace(/\/$/, "")}/songs/${c.song}/`;
  const longest = Math.max(0, ...[...`${c.text}${c.name ?? ""}`.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(4, longest + 1));
  return {
    branch: `visitor/${c.song}-${c.id}`,
    path: `content/visitor-comments/${c.song}/${c.id}.json`,
    content: `${JSON.stringify(c, null, 2)}\n`,
    title: `From visitors · ${songTitle}: "${excerpt}"`,
    // The visitor's words in a code block, so an @name in them pings no one and links and images don't render (the repo
    // is public); fenced with more backticks than they have in a row.
    body: [
      `A visitor left a comment on **${songTitle}** (${page}).`,
      "",
      `${fence}text`,
      c.text,
      `— ${c.name ?? "Anonymous"}, ${c.date}`,
      fence,
      "",
      "Merge to publish it on the song's page; close to discard it. You can edit the file here before merging.",
    ].join("\n"),
    commitMessage: `Visitor comment on ${songTitle}`,
  };
}

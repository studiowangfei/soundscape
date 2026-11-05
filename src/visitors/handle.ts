import { githubEnv, openCommentPullRequest, openVisitorPullRequests, songTitle } from "./github";
import { visitorKey, type RateLimiter } from "./limit";
import { checkSubmission, pullRequestFor, toComment } from "./submission";

type Result = { status: number; json: { ok: true } | { error: string } };
type Context = {
  /** The visitor's address, only to count their comments in memory; never stored, logged or sent on. */
  ip: string | null;
  now: Date;
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  /** Comments per visitor (5 an hour), and from everyone together (30 an hour), on this server instance. */
  limiter: RateLimiter;
  everyone: RateLimiter;
  brake: PullRequestBrake;
  /** The site's address, for the song link in the pull request. */
  siteUrl?: string;
  random?: () => number;
};

/** Comments waiting for approval past which new ones are turned away. */
const MAX_WAITING = 50;
const BUSY = "Lots of comments right now. Try again later.";
const FAILED = "Something went wrong. Try again in a moment.";
const ok: Result = { status: 200, json: { ok: true } };

/**
 * Whether the request can be a comment from the site's own form: JSON, and, when a browser says where it comes from,
 * from this site. Turns away other sites making their visitors' browsers post here (a form or a plain-text fetch
 * needs no permission from us), which would spend the token's GitHub quota. Null when it's fine.
 */
export function requestProblem(headers: Headers, url: string): Result | null {
  if (!/^application\/json\b/i.test(headers.get("content-type") ?? "")) return { status: 415, json: { error: FAILED } };
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site");
  // The site is the host the browser asked for (behind Vercel's proxy, the forwarded one), not the address the server
  // listens on: `next dev -H 0.0.0.0` hands the route http://0.0.0.0:3000/… while the page is on localhost or the LAN.
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(url).host;
  const elsewhere = (origin && origin !== "null" && new URL(origin).host !== host) || (site && site !== "same-origin" && site !== "none");
  return elsewhere ? { status: 403, json: { error: FAILED } } : null;
}

/**
 * Whether too many comments are waiting for approval, asking GitHub at most once a minute (and counting the ones opened
 * since), so a full queue turns comments away without a call to GitHub. Several requests at once may each see one
 * slot left: a soft brake.
 */
export class PullRequestBrake {
  private waiting = 0;
  private askedAt = -Infinity;

  constructor(private ttlMs = 60_000) {}

  async full(ask: () => Promise<number>, now: number): Promise<boolean> {
    if (now - this.askedAt >= this.ttlMs) {
      this.waiting = await ask();
      this.askedAt = now;
    }
    return this.waiting >= MAX_WAITING;
  }

  opened() {
    this.waiting += 1;
  }
}

/** A visitor's comment, from the form's POST to a pull request on the site's repo. */
export async function handleSubmission(body: unknown, ctx: Context): Promise<Result> {
  const verdict = checkSubmission(body);
  if (verdict.kind === "bot") return ok;
  if (verdict.kind === "invalid") return { status: 400, json: { error: verdict.message } };
  if (ctx.env.SOUNDSCAPE_VISITOR_DRY_RUN === "1") return ok;
  const gh = githubEnv(ctx.env);
  if (!gh) return { status: 503, json: { error: "Comments are closed for now." } };
  const at = ctx.now.getTime();
  if (!ctx.limiter.allow(visitorKey(ctx.ip), at) || !ctx.everyone.allow("everyone", at)) return { status: 429, json: { error: BUSY } };
  const fetchImpl = ctx.fetchImpl ?? fetch;
  try {
    if (await ctx.brake.full(() => openVisitorPullRequests(gh, fetchImpl), at)) return { status: 429, json: { error: BUSY } };
    const title = await songTitle(gh, verdict.song, fetchImpl);
    if (!title) return { status: 400, json: { error: "Unknown song." } };
    await openCommentPullRequest(gh, pullRequestFor(toComment(verdict, ctx.now, ctx.random), title, ctx.siteUrl), fetchImpl);
    ctx.brake.opened();
    return ok;
  } catch {
    return { status: 502, json: { error: FAILED } };
  }
}

import type { pullRequestFor } from "./submission";

/** Where comments go: the site's GitHub repo, and a token allowed to open pull requests on it. */
export type GitHubEnv = { token: string; repo: string };
type PullRequest = ReturnType<typeof pullRequestFor>;

const API = "https://api.github.com";

/** The GitHub settings (Vercel environment variables), or null when they aren't set. */
export function githubEnv(env: Record<string, string | undefined> = process.env): GitHubEnv | null {
  const token = env.SOUNDSCAPE_GITHUB_TOKEN;
  const repo = env.SOUNDSCAPE_GITHUB_REPO;
  return token && repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? { token, repo } : null;
}

class GitHubError extends Error {}

async function call<T = unknown>(gh: GitHubEnv, fetchImpl: typeof fetch, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchImpl(`${API}/repos/${gh.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "soundscape-visitor-comments",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new GitHubError(`${method} ${path}: ${res.status}`);
  return (await res.json().catch(() => ({}))) as T;
}

/** How many comments are waiting for approval: open pull requests from visitor branches. */
export async function openVisitorPullRequests(gh: GitHubEnv, fetchImpl: typeof fetch = fetch): Promise<number> {
  const pulls = await call<{ head: { ref: string } }[]>(gh, fetchImpl, "GET", "/pulls?state=open&per_page=100");
  return pulls.filter((p) => p.head.ref.startsWith("visitor/")).length;
}

/** The song's title from its entry in the repo, or null when there's no such song. */
export async function songTitle(gh: GitHubEnv, slug: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const file = await call<{ content: string }>(gh, fetchImpl, "GET", `/contents/content/songs/${slug}.json`);
    return (JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as { title?: string }).title ?? null;
  } catch (e) {
    if (e instanceof GitHubError && / 404$/.test(e.message)) return null;
    throw e;
  }
}

/**
 * Proposes one comment: a branch off the default branch, the comment's file on it, a pull request labelled
 * visitor-comment. If anything fails once the branch exists, the branch is deleted (best effort) and the error rethrown.
 */
export async function openCommentPullRequest(gh: GitHubEnv, pr: PullRequest, fetchImpl: typeof fetch = fetch): Promise<{ number: number; url: string }> {
  const { default_branch: base } = await call<{ default_branch: string }>(gh, fetchImpl, "GET", "");
  const { object } = await call<{ object: { sha: string } }>(gh, fetchImpl, "GET", `/git/ref/heads/${base}`);
  await call(gh, fetchImpl, "POST", "/git/refs", { ref: `refs/heads/${pr.branch}`, sha: object.sha });
  let opened: { number: number; html_url: string };
  try {
    await call(gh, fetchImpl, "PUT", `/contents/${pr.path}`, { message: pr.commitMessage, content: Buffer.from(pr.content, "utf8").toString("base64"), branch: pr.branch });
    opened = await call(gh, fetchImpl, "POST", "/pulls", { title: pr.title, body: pr.body, head: pr.branch, base });
  } catch (e) {
    await call(gh, fetchImpl, "DELETE", `/git/refs/heads/${pr.branch}`).catch(() => {});
    throw e;
  }
  // The pull request is there either way; a missing label only makes it a little harder to spot.
  await call(gh, fetchImpl, "POST", `/issues/${opened.number}/labels`, { labels: ["visitor-comment"] }).catch(() => {});
  return { number: opened.number, url: opened.html_url };
}

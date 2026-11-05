import { handleSubmission, PullRequestBrake, requestProblem } from "@/visitors/handle";
import { RateLimiter } from "@/visitors/limit";

// A visitor's comment from a song's end card, proposed as a pull request on the site's repo (visitors/handle.ts).
export const dynamic = "force-dynamic";

const limiter = new RateLimiter();
const everyone = new RateLimiter(30);
const brake = new PullRequestBrake();

export async function POST(request: Request) {
  const problem = requestProblem(request.headers, request.url);
  if (problem) return Response.json(problem.json, { status: problem.status });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Something went wrong. Try again in a moment." }, { status: 400 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { status, json } = await handleSubmission(body, { ip, now: new Date(), env: process.env, limiter, everyone, brake, siteUrl: new URL(request.url).origin });
  return Response.json(json, { status });
}

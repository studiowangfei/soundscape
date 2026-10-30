/**
 * Renders fog panes in a Web Worker, so building a backdrop never blocks the page (or the landing page's wheel). Each
 * render supersedes the one before: an older call that's still running resolves null, never with stale pixels. With
 * no worker (it can't be created, or it fails to load), jobs run on the main thread instead.
 */
import { runFogJob, type FogJob, type FogResult } from "./fog-job";

type Exec = (job: FogJob) => Promise<FogResult>;

const onMainThread: Exec = (job) => Promise.resolve().then(() => runFogJob(job));

/** A worker-backed executor, or null when workers aren't available here. */
function workerExec(): { exec: Exec; stop: () => void } | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./fog-worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  const pending = new Map<number, { job: FogJob; resolve: (r: FogResult) => void }>();
  let broken = false;
  worker.onmessage = (e: MessageEvent<FogResult>) => {
    pending.get(e.data.id)?.resolve(e.data);
    pending.delete(e.data.id);
  };
  // A worker that fails to load or crashes: finish what it had on the main thread, and use the main thread from now on.
  worker.onerror = () => {
    broken = true;
    for (const { job, resolve } of pending.values()) void onMainThread(job).then(resolve);
    pending.clear();
  };
  return {
    exec: (job) => {
      if (broken) return onMainThread(job);
      return new Promise((resolve) => {
        pending.set(job.id, { job, resolve });
        const src = job.src.slice(); // the caller keeps its pixels (running drops are painted from them)
        worker.postMessage({ ...job, src }, [src.buffer]);
      });
    },
    stop: () => worker.terminate(),
  };
}

export function createFogRenderer(exec?: Exec) {
  const backed = exec ? null : workerExec();
  const run = exec ?? backed?.exec ?? onMainThread;
  // One job at a time; asks that come in meanwhile don't pile up: only the latest waits (a slider drag's in-between
  // values are never rendered).
  let latest = 0;
  let busy = false;
  let waiting: { job: FogJob; resolve: (r: FogResult | null) => void } | null = null;
  const start = (job: FogJob, resolve: (r: FogResult | null) => void) => {
    busy = true;
    void run(job).then((result) => {
      resolve(job.id === latest ? result : null);
      busy = false;
      const next = waiting;
      waiting = null;
      if (next) start(next.job, next.resolve);
    });
  };
  return {
    render(job: Omit<FogJob, "id">): Promise<FogResult | null> {
      const id = ++latest;
      return new Promise((resolve) => {
        if (!busy) return start({ ...job, id }, resolve);
        waiting?.resolve(null);
        waiting = { job: { ...job, id }, resolve };
      });
    },
    dispose() {
      latest++;
      waiting?.resolve(null);
      waiting = null;
      backed?.stop();
    },
  };
}

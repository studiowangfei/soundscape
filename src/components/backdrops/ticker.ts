/**
 * A loop that only runs when it has work, for the Fog's clocks (push-in, thickening, fading, drips). Each call of
 * `step` says what's next: "frame" (something is moving: call again next frame), a number of ms (nothing to draw until
 * then: sleep on a timer, no frames), or "stop" (nothing to do until woken). An idle page then wakes no frames at all,
 * where six loops ticking every frame used to wake it ~360 times a second.
 */
export type Next = "frame" | "stop" | number;

type Env = {
  now: () => number;
  raf: (fn: (t: number) => void) => number;
  caf: (h: number) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (h: number) => void;
};

const browser = (): Env => ({
  now: () => performance.now(),
  raf: (fn) => requestAnimationFrame(fn),
  caf: (h) => cancelAnimationFrame(h),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h),
});

/** Starts `step` on the next frame. `wake()`: run it again on the next frame (sooner than a timer it's sleeping on); `stop()`: end it for good. */
export function ticker(step: (now: number) => Next, env: Env = browser()) {
  let frame = 0;
  let timer = 0;
  let ended = false;
  const run = (now: number) => {
    frame = 0;
    if (ended) return;
    const next = step(now);
    if (ended || next === "stop") return;
    if (next === "frame") frame = env.raf(run);
    else timer = env.setTimeout(() => {
      timer = 0;
      run(env.now());
    }, Math.max(0, next));
  };
  const wake = () => {
    if (ended || frame) return;
    if (timer) env.clearTimeout(timer);
    timer = 0;
    frame = env.raf(run);
  };
  wake();
  return {
    wake,
    stop: () => {
      ended = true;
      if (frame) env.caf(frame);
      if (timer) env.clearTimeout(timer);
      frame = timer = 0;
    },
  };
}

/**
 * Asks for a drawing, made at most once per frame, at the frame: however many things ask in between (pointer moves,
 * a running drop, the slow changes), the next frame draws once. After a drawing it waits twice as long as that took
 * before the next (on a slow phone a drawing can outlast a frame; back to back they'd leave no time to load a page).
 * Drawing on the frame matters in Safari, which does canvas work after the script returns: drawings made straight
 * from events queued up there unseen (a fast script and a slow screen), and a wipe showed up late. A wait shorter
 * than a frame isn't kept: the next frame comes soon enough.
 */
const FRAME_MS = 16;

export function frameDraw(draw: () => void, env: Env = browser()) {
  let frame = 0;
  let timer = 0;
  let busyUntil = 0;
  const run = () => {
    frame = 0;
    const t = env.now();
    draw();
    const end = env.now();
    busyUntil = end + 2 * (end - t);
  };
  return {
    request() {
      if (frame || timer) return;
      // A wait shorter than a frame is served by the next frame anyway (drawing on alternate frames would halve a
      // running drop's frame rate); a longer one sleeps first.
      const wait = busyUntil - env.now();
      if (wait > FRAME_MS)
        timer = env.setTimeout(() => {
          timer = 0;
          frame = env.raf(run);
        }, wait);
      else frame = env.raf(run);
    },
    cancel() {
      if (frame) env.caf(frame);
      if (timer) env.clearTimeout(timer);
      frame = timer = 0;
    },
  };
}

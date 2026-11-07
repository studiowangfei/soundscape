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

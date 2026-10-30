/**
 * How the song wheel moves, driven by the caller's clock (ms, e.g. performance.now()) so it's tested in Node. It turns
 * like a pager: a trackpad swipe or a mouse-wheel notch moves one song, a flick at most one song past where the finger
 * left it, and the list loops. Positions are unbounded rows (row k shows song wrap(k, count)). SongWheel feeds it
 * events and ticks it every frame while `moving`.
 */
import { flickTarget, nearestEquivalent, springStep, wrap } from "./wheel";

export type Mode = "idle" | "drag" | "spring" | "ease";

/** A flick's speed comes only from the finger's last 100 ms, so a drag that stops before letting go doesn't fling. */
const FLICK_WINDOW = 100;
/** A trackpad swipe turns the page once it has moved this many px. */
const PAGE_DISTANCE = 30;
/** Wheel events further apart than this belong to different swipes. */
const SWIPE_GAP = 180;

export class WheelMotion {
  pos: number;
  vel = 0;
  target: number;
  mode: Mode = "idle";
  private from = 0;
  private t0 = 0;
  private lastTick = 0;
  private swipe = { at: -Infinity, size: 0, travel: 0, turned: false };
  private press_: { y: number; start: number; moved: boolean; row: number | null; wasIdle: boolean; samples: { t: number; p: number }[] } | null = null;

  constructor(
    public count: number,
    start: number,
    public opts: { pitch: number; reduced: boolean },
  ) {
    this.pos = this.target = start;
  }

  /** Needs ticking: on its way somewhere. */
  get moving() {
    return this.mode === "spring" || this.mode === "ease";
  }

  /** The song at the centre right now. */
  get centre() {
    return wrap(Math.round(this.pos), this.count);
  }

  /** Where a step from here starts: where the wheel is going if it's on its way, else the centred row. */
  private aim() {
    return this.moving ? this.target : Math.round(this.pos);
  }

  /** The song a choice (Enter) applies to: where the wheel is going if it's on its way, else the centred song. */
  chosen() {
    return wrap(this.aim(), this.count);
  }

  /** Off to row `k` (unbounded): a spring, or a short ease with reduced motion. */
  goTo(k: number, now: number) {
    this.target = Math.round(k);
    this.lastTick = now;
    if (this.opts.reduced) {
      this.mode = "ease";
      this.from = this.pos;
      this.t0 = now;
    } else this.mode = "spring";
  }

  /** Off to song `i`, the short way round the loop. */
  goToSong(i: number, now: number) {
    this.goTo(nearestEquivalent(this.aim(), i, this.count), now);
  }

  press(y: number, row: number | null, now: number) {
    this.press_ = { y, start: this.pos, moved: false, row, wasIdle: this.mode === "idle", samples: [{ t: now, p: this.pos }] };
    this.mode = "drag";
  }

  move(y: number, now: number) {
    const p = this.press_;
    if (!p) return;
    if (Math.abs(y - p.y) > 4) p.moved = true;
    this.pos = p.start + (p.y - y) / this.opts.pitch;
    p.samples.push({ t: now, p: this.pos });
    if (p.samples.length > 12) p.samples.shift();
  }

  /** The press ends. Returns the song to open: a tap on the centred row while the wheel was at rest. */
  release(now: number): { open: number | null } {
    const p = this.press_;
    this.press_ = null;
    if (!p) return { open: null };
    if (!p.moved) {
      const c = Math.round(this.pos);
      if (p.row === c && p.wasIdle) {
        this.mode = "idle";
        return { open: wrap(c, this.count) };
      }
      this.goTo(p.row ?? c, now); // another row spins to the centre; a tap mid-spin stops it there
      return { open: null };
    }
    const recent = [...p.samples, { t: now, p: this.pos }].filter((s) => s.t >= now - FLICK_WINDOW);
    const [a, b] = [recent[0], recent[recent.length - 1]];
    const vel = recent.length >= 2 && b.t > a.t ? ((b.p - a.p) / (b.t - a.t)) * 1000 : 0;
    this.goTo(flickTarget(this.pos, vel), now);
    return { open: null };
  }

  /** A cancelled press (the browser took the pointer): settle where it is; never opens anything. */
  cancel(now: number) {
    if (!this.press_) return;
    this.press_ = null;
    this.goTo(this.pos, now);
  }

  /**
   * Trackpad: one swipe turns one page, however long its momentum lasts. A new swipe starts after a pause, or when the
   * deltas jump back up (a fresh push while the last swipe's momentum is still coming in).
   */
  scroll(deltaY: number, now: number) {
    if (this.mode === "drag") return;
    const size = Math.abs(deltaY);
    const s = this.swipe;
    if (now - s.at > SWIPE_GAP || size > s.size * 1.5 + 4) Object.assign(s, { travel: 0, turned: false });
    s.at = now;
    s.size = size;
    if (s.turned) return;
    s.travel += deltaY;
    if (Math.abs(s.travel) >= PAGE_DISTANCE) {
      s.turned = true;
      this.goTo(this.aim() + Math.sign(s.travel), now);
    }
  }

  /** Mouse wheel: one row per notch; quick notches add up. */
  notch(dir: number, now: number) {
    this.goTo(this.aim() + Math.sign(dir), now);
  }

  /** Arrow keys, Page Up/Down, Home/End. Returns whether the key was the wheel's. */
  key(name: string, now: number): boolean {
    const step = ({ ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 } as Record<string, number>)[name];
    if (step) this.goTo(this.aim() + step, now);
    else if (name === "Home") this.goToSong(0, now);
    else if (name === "End") this.goToSong(this.count - 1, now);
    else return false;
    return true;
  }

  /** Advances to `now`. Returns the song the wheel came to rest on, if it just did. */
  tick(now: number): { rested: number | null } {
    const dt = Math.min(0.05, Math.max(0, (now - (this.lastTick || now - 16)) / 1000));
    this.lastTick = now;
    if (this.mode === "spring") {
      const next = springStep(this.pos, this.vel, this.target, dt);
      this.pos = next.pos;
      this.vel = next.vel;
      // At rest as soon as it looks still: well under a pixel from its row, barely moving.
      if (Math.abs(this.pos - this.target) < 0.01 && Math.abs(this.vel) < 0.1) return this.rest();
    } else if (this.mode === "ease") {
      const t = Math.min(1, (now - this.t0) / 150);
      this.pos = this.from + (this.target - this.from) * (1 - (1 - t) ** 3);
      if (t >= 1) return this.rest();
    }
    return { rested: null };
  }

  /** At rest on the target; positions are brought back into the first lap (same rows on screen). */
  private rest() {
    const song = wrap(this.target, this.count);
    this.pos = this.target = song;
    this.vel = 0;
    this.mode = "idle";
    return { rested: song };
  }
}

/**
 * How the song wheel moves, driven by the caller's clock (ms, e.g. performance.now()) so it's tested in Node. It turns
 * like a pager: a mouse-wheel notch moves one song, a mouse drag's flick at most one song past where it let go; a
 * finger's flick and a trackpad swipe glide on from their speed, slowing to a stop a few songs on at most (glideTarget,
 * swipeRows).
 * The list loops. Positions are unbounded rows (row k shows song wrap(k, count)). SongWheel feeds it
 * events and ticks it every frame while `moving`.
 */
import { flickTarget, glideTarget, nearestEquivalent, rollSecs, rollTarget, springStep, SWIPE, swipeRows, wrap } from "./wheel";

export type Mode = "idle" | "drag" | "spring" | "ease" | "glide";

/** A flick's speed comes only from the finger's last 100 ms, so a drag that stops before letting go doesn't fling. */
const FLICK_WINDOW = 100;
/** A trackpad swipe turns the page once it has moved this many px. */
const PAGE_DISTANCE = 30;
/** Wheel events further apart than this belong to different swipes. */
const SWIPE_GAP = 180;
/** A swipe turns the wheel only if it moves PAGE_DISTANCE within this many ms: a momentum's sparse tail never does. */
const TURN_MS = 300;
/** A jump in the deltas starts a new swipe only once the last one's have faded under this share of their peak. */
const FADED = 0.35;

export class WheelMotion {
  pos: number;
  vel = 0;
  target: number;
  mode: Mode = "idle";
  private from = 0;
  private t0 = 0;
  private easeMs = 150;
  private glideTau = 0.3;
  private lastTick = 0;
  private swipe = { at: -Infinity, size: 0, travel: 0, turned: false, trackpad: false, start: 0, base: 0, peak: 0, rows: 0, peakPx: 0 };
  private press_: { y: number; start: number; moved: boolean; row: number | null; wasIdle: boolean; samples: { t: number; p: number }[] } | null = null;

  constructor(
    public count: number,
    start: number,
    public opts: { pitch: number; reduced: boolean },
  ) {
    this.pos = this.target = start;
  }

  /** A finger (or the mouse) is on the wheel and has moved it. */
  get dragged() {
    return this.mode === "drag" && !!this.press_?.moved;
  }

  /** Needs ticking: on its way somewhere. */
  get moving() {
    return this.mode === "spring" || this.mode === "ease" || this.mode === "glide";
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
    if (this.opts.reduced) this.ease(150, now);
    else this.mode = "spring";
  }

  /**
   * The 🎲: a spin to a random other song (rollTarget; `rand` is Math.random's [0, 1)), off at full speed and slowing
   * to a stop on it like a wheel spun by hand, in about a second (rollSecs); a short ease with reduced motion.
   */
  roll(rand: number, now: number) {
    this.target = rollTarget(this.aim(), this.count, rand);
    this.lastTick = now;
    this.ease(this.opts.reduced ? 150 : rollSecs(this.target - this.pos) * 1000, now);
  }

  /**
   * Coasts to row `k` from the finger's speed `vel` (rows/s): slowing down all the way (exponentially, as a flicked list
   * does), starting at that very speed so the list doesn't stop dead as the finger lifts, and arriving in 4 time
   * constants (kept between 0.08 and 0.6 s, so a speed that hardly fits the distance still starts close to it). With
   * no speed towards the row (the finger stopped, or turned back) it springs there from rest.
   */
  private glide(k: number, vel: number, now: number) {
    const d = Math.round(k) - this.pos;
    if (!d || Math.sign(vel) !== Math.sign(d)) return this.goTo(k, now);
    const tau = Math.min(0.6, Math.max(0.08, d / vel));
    this.target = Math.round(k);
    this.mode = "glide";
    this.from = this.pos;
    this.t0 = now;
    this.lastTick = now;
    this.glideTau = tau;
    this.vel = vel;
  }

  private ease(ms: number, now: number) {
    this.mode = "ease";
    this.from = this.pos;
    this.t0 = now;
    this.easeMs = ms;
  }

  /** Off to song `i`, the short way round the loop. */
  goToSong(i: number, now: number) {
    this.goTo(nearestEquivalent(this.aim(), i, this.count), now);
  }

  press(y: number, row: number | null, now: number) {
    this.press_ = { y, start: this.pos, moved: false, row, wasIdle: this.mode === "idle", samples: [{ t: now, p: this.pos }] };
    this.mode = "drag";
    this.vel = 0; // caught: whatever speed it had is gone (or the settle after letting go would start with it)
  }

  move(y: number, now: number) {
    const p = this.press_;
    if (!p) return;
    if (Math.abs(y - p.y) > 4) p.moved = true;
    this.pos = p.start + (p.y - y) / this.opts.pitch;
    p.samples.push({ t: now, p: this.pos });
    if (p.samples.length > 12) p.samples.shift();
  }

  /**
   * The press ends. Returns the song to open (a tap on the centred row while the wheel was at rest), and whether it was
   * a tap on a title at all. `glide`: a finger, whose flick carries on (glideTarget); a mouse's turns one page at most.
   */
  release(now: number, glide = false): { open: number | null; tap: boolean } {
    const p = this.press_;
    this.press_ = null;
    if (!p) return { open: null, tap: false };
    if (!p.moved) {
      const c = Math.round(this.pos);
      if (p.row === c && p.wasIdle) {
        this.mode = "idle";
        return { open: wrap(c, this.count), tap: true };
      }
      this.goTo(p.row ?? c, now); // another row spins to the centre; a tap mid-spin stops it there
      return { open: null, tap: p.row !== null };
    }
    const recent = [...p.samples, { t: now, p: this.pos }].filter((s) => s.t >= now - FLICK_WINDOW);
    const [a, b] = [recent[0], recent[recent.length - 1]];
    const vel = recent.length >= 2 && b.t > a.t ? ((b.p - a.p) / (b.t - a.t)) * 1000 : 0;
    if (glide && !this.opts.reduced) this.glide(glideTarget(this.pos, vel), vel, now);
    else this.goTo(flickTarget(this.pos, vel), now);
    return { open: null, tap: false };
  }

  /** A cancelled press (the browser took the pointer): settle where it is; never opens anything. */
  cancel(now: number) {
    if (!this.press_) return;
    this.press_ = null;
    this.goTo(this.pos, now);
  }

  /**
   * Trackpad: a swipe glides as far as its push was fast (swipeRows: one song to a few), however long its momentum
   * lasts. It sets off once the swipe has moved PAGE_DISTANCE px, and reaches further while the push is still speeding
   * up (its first SWIPE.pushMs); what comes after (the momentum macOS adds) is ignored. A new swipe starts after a
   * pause, or when the deltas jump back up once the last swipe's have faded (a fresh push: touching the trackpad stops
   * the momentum, and the push builds up from small deltas). Not the jump as the fingers lift, when macOS's momentum
   * starts up near the push's speed: read as a fresh push, it set off a second glide at the end of a hard swipe.
   */
  scroll(deltaY: number, now: number) {
    if (this.mode === "drag") return;
    const size = Math.abs(deltaY);
    const s = this.swipe;
    const gap = now - s.at;
    // (Not while a push is still speeding up: its first SWIPE.pushMs is all one swipe.)
    const fresh = size > s.size * 1.5 + 2 && now - s.start > SWIPE.pushMs && s.size < s.peakPx * FADED;
    if (gap > SWIPE_GAP || fresh) Object.assign(s, { travel: 0, turned: false, start: now, base: this.aim(), peak: 0, rows: 0, peakPx: 0 });
    s.at = now;
    s.size = size;
    s.peakPx = Math.max(s.peakPx, size);
    const pushing = now - s.start <= SWIPE.pushMs;
    // Its speed, rows/s: a trackpad sends a delta a frame, so this one's px over a frame (timing each against the gap
    // since the last made it jumpy: events arrive a few ms early or late).
    if (pushing) s.peak = Math.max(s.peak, (size * 60) / this.opts.pitch);
    const dir = Math.sign(s.travel || deltaY);
    if (!s.turned) {
      s.travel += deltaY;
      if (Math.abs(s.travel) < PAGE_DISTANCE || now - s.start > TURN_MS) return;
      s.turned = true;
      s.rows = this.opts.reduced ? 1 : swipeRows(s.peak);
      if (this.opts.reduced) this.goTo(s.base + dir, now);
      else this.glide(s.base + dir * s.rows, dir * s.peak, now);
    } else if (pushing && !this.opts.reduced && swipeRows(s.peak) > s.rows) {
      s.rows = swipeRows(s.peak);
      this.glide(s.base + dir * s.rows, this.vel || dir * s.peak, now); // pushed harder: further, from the speed it's at
    }
  }

  /**
   * A wheel event, as wheelAction() read it. A hard trackpad swipe can send a few deltas big enough to read as notches
   * (at its push or in its momentum): within one gesture (no pause longer than SWIPE_GAP) that has scrolled, they
   * scroll too, and a notch that started a gesture counts as that swipe's page. So one swipe never turns twice.
   */
  wheel(deltaY: number, action: "scroll" | "notch", now: number) {
    const s = this.swipe;
    if (action === "notch" && !(s.trackpad && now - s.at <= SWIPE_GAP)) {
      const base = this.aim(); // a trackpad swipe it turns out to start reaches on from here, the notch its first song
      this.notch(deltaY, now);
      Object.assign(s, { at: now, size: Math.abs(deltaY), travel: Math.sign(deltaY) * PAGE_DISTANCE, turned: true, trackpad: false, start: now, base, peak: 0, rows: 1, peakPx: Math.abs(deltaY) });
      return;
    }
    s.trackpad = true;
    this.scroll(deltaY, now);
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
    } else if (this.mode === "glide") {
      const t = (now - this.t0) / 1000;
      const span = 4 * this.glideTau;
      const k = (1 - Math.exp(-Math.min(t, span) / this.glideTau)) / (1 - Math.exp(-4));
      const before = this.pos;
      this.pos = this.from + (this.target - this.from) * k;
      this.vel = dt ? (this.pos - before) / dt : this.vel;
      if (t >= span) return this.rest();
    } else if (this.mode === "ease") {
      const t = Math.min(1, (now - this.t0) / this.easeMs);
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

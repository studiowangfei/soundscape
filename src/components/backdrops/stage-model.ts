/**
 * The backdrop stage's rules (Stage.tsx draws them): one backdrop above every page, which each page tells what to show
 * (a scene). Each scene key gets a pane of its own (the landing page one for its whole visit, a song page one per song);
 * a new pane builds unseen under the one on screen, and takes over only once it has drawn, so the window never goes
 * dark between pages. Going between the landing page and a song moves the cover itself, as seen through the mist,
 * from one frame to the other; the landing page's fog starts as thick as the song's was (a song's starts clear). Pure, so it's tested in Node.
 */
import type { Box } from "../cards/morph";
import { STACK, type coverFrame, type Layout, type Song } from "./art";
import type { VariantKey } from "./Backdrop";
import type { Params } from "./params";

export type Mode = "landing" | "song";

/** What a page shows: `key` names its pane (the same key keeps the pane, with these props; a new one starts afresh). */
export type Scene = { mode: Mode; key: string; song: Song; variant: VariantKey; params: Params; layout: Layout; seed?: number; hold?: boolean };

/** hidden: building unseen; entering: fading in; shown: on screen; leaving: fading out, then gone. */
export type Phase = "hidden" | "entering" | "shown" | "leaving";
export type Pane = { id: number; scene: Scene; ready: boolean; phase: Phase };
/** Panes bottom to top; `moving`: the cover is moving between frames and a new pane waits (until it mists over: the
 * move's last TIMING.mistOver ms, so the incoming fog is fully up as the cover lands). */
export type StageState = { panes: Pane[]; moving: boolean; nextId: number };
export type StageAction =
  | { type: "show"; scene: Scene }
  | { type: "ready"; id: number }
  | { type: "entered"; id: number }
  | { type: "gone"; id: number }
  | { type: "moveStart" }
  | { type: "mistOpen" }
  | { type: "moveDone" };

export const EMPTY_STAGE: StageState = { panes: [], moving: false, nextId: 1 };

/** The transitions' timings (ms), in one place to tune by eye. */
export const TIMING = {
  /** The landing page's wheel and buttons fade out before a song opens. */
  landingExit: 200,
  /** A song page's title and cards fade out before the next page. */
  songExit: 180,
  /** The outgoing pane fades off the moving (misted) cover as it starts: its droplets, writing and wipes go. */
  dropsOut: 200,
  move: 500,
  moveEase: "cubic-bezier(0.65, 0, 0.35, 1)",
  /** The incoming fog over the moving (misted) cover: over the move's last this many ms, ending as it lands (fading in
   * slowly at first, so it's faint while the cover is still on its way)… */
  mistOver: 300,
  /** …or, if it's drawn later than that, over at least this long once it has. */
  mistMin: 180,
  /** One pane over another in place (song to song, a backdrop style switched), and a fresh page's fade-in. */
  handover: 400,
  /** The incoming page's own text and controls fade up… */
  entrance: 400,
  /** …from this far into the move. */
  entranceAt: 0.6,
} as const;

/** A pane that hasn't drawn by now takes over anyway (its cover never loaded): the page shows its dark base. */
export const READY_TIMEOUT_MS = 4000;

function sameParams(a: Params, b: Params) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** The same scene, though maybe new objects (pages pass fresh ones every render). */
export function sameScene(a: Scene, b: Scene): boolean {
  return (
    a.mode === b.mode &&
    a.key === b.key &&
    a.variant === b.variant &&
    a.layout === b.layout &&
    a.seed === b.seed &&
    a.hold === b.hold &&
    a.song.cover === b.song.cover &&
    a.song.title === b.song.title &&
    a.song.artist === b.song.artist &&
    a.song.coverKind === b.song.coverKind &&
    sameParams(a.params, b.params)
  );
}

const visible = (p: Pane) => p.phase === "shown" || p.phase === "entering";

/** The top pane takes over once it has drawn and no move is under way; the others fade out. */
function promote(s: StageState): StageState {
  const top = s.panes[s.panes.length - 1];
  if (!top || top.phase !== "hidden" || !top.ready || s.moving) return s;
  return { ...s, panes: s.panes.map((p) => (p === top ? { ...p, phase: "entering" } : visible(p) ? { ...p, phase: "leaving" } : p)) };
}

function step(s: StageState, a: StageAction): StageState {
  const set = (id: number, f: (p: Pane) => Pane) => ({ ...s, panes: s.panes.map((p) => (p.id === id ? f(p) : p)) });
  switch (a.type) {
    case "show": {
      const same = s.panes.find((p) => p.scene.key === a.scene.key && p.phase !== "leaving");
      if (same) return sameScene(same.scene, a.scene) ? s : set(same.id, (p) => ({ ...p, scene: a.scene }));
      // Newest wins: a pane that never got on screen is dropped for this one.
      const kept = s.panes.filter((p) => p.phase !== "hidden");
      return { ...s, panes: [...kept, { id: s.nextId, scene: a.scene, ready: false, phase: "hidden" }], nextId: s.nextId + 1 };
    }
    case "ready":
      return set(a.id, (p) => (p.ready ? p : { ...p, ready: true }));
    case "entered":
      return set(a.id, (p) => (p.phase === "entering" ? { ...p, phase: "shown" } : p));
    case "gone":
      return { ...s, panes: s.panes.filter((p) => p.id !== a.id) };
    case "moveStart":
      return { ...s, moving: true, panes: s.panes.map((p) => (visible(p) ? { ...p, phase: "leaving" } : p)) };
    case "mistOpen":
    case "moveDone":
      return { ...s, moving: false };
  }
}

/**
 * How thick a page's fog starts, given how thick the page left's had got (`carried`): a song page's starts clear, so it
 * thickens over its own time from when the song opens; the landing page's carries on from where the song's had got.
 */
export const startThickness = (mode: Mode, carried: number) => (mode === "song" ? 0 : carried);

/** The scene `key` is fully on screen: its pane has finished fading in (and isn't fading out). */
export const isShown = (s: StageState, key: string) => s.panes.some((p) => p.scene.key === key && p.phase === "shown");

export function stageReducer(s: StageState, a: StageAction): StageState {
  const next = step(s, a);
  return next === s ? s : promote(next);
}

/**
 * Where the scene canvas pushes in towards (its CSS transform-origin, globals.css .animate-subtle-zoom and zoomOrigin):
 * the window's centre where the cover fills it, the cover's centre where it sits beside the content, and the centre of
 * the band it covers on the stacked layout (50% 35%).
 */
export function sceneOrigin(f: ReturnType<typeof coverFrame>, W: number, H: number): { x: number; y: number } {
  if (f.fill) return { x: W / 2, y: H / 2 };
  return f.wide ? { x: f.ox + f.side / 2, y: H / 2 } : { x: W / 2, y: (H * STACK) / 2 };
}

/** The cover's square as seen on screen, pushed in `z` about `origin`. */
export function visibleBox(f: { side: number; ox: number; oy: number }, z: number, origin: { x: number; y: number }): Box {
  return { left: origin.x + (f.ox - origin.x) * z, top: origin.y + (f.oy - origin.y) * z, width: f.side * z, height: f.side * z };
}

/** The cover sits somewhere else on the other page (the landing page and a song's), so it moves there. */
export function needsMove(a: { side: number; ox: number; oy: number }, b: { side: number; ox: number; oy: number }): boolean {
  return a.side !== b.side || a.ox !== b.ox || a.oy !== b.oy;
}

/** The moving cover's edge fade: where its fade starts and ends across (x) and down (y), in % of the moving picture. */
export type Edge = { x0: number; x1: number; x2: number; x3: number; y0: number; y1: number; y2: number; y3: number };

/** Which way a page lays its cover out, for its edge fade: filling the window, beside the content, or stacked above it. */
export type Kind = "fill" | "wide" | "stacked";
export const kindOf = (f: { wide: boolean; fill: boolean }): Kind => (f.fill ? "fill" : f.wide ? "wide" : "stacked");

/**
 * The edge fade a page's fog lays on its cover (variants.tsx fadeStops), for the moving cover: a picture of the cover
 * square with a margin `M` round it (as a fraction of the square's side), faded as a page whose own margin (its edge
 * bleed) is `m` ≤ M. Beside the content (wide): transparent at the margin's outer edge, opaque from 30% into the cover
 * from the left, and from the cover's edge top, bottom and right (with no margin: 10% in, top and bottom, and a hard
 * right edge). Stacked: opaque over the whole cover, fading across the margin on every side (with no margin: hard
 * edges, but for the cover's last 10% at the bottom). Filling the window: no fade.
 */
export function edgeStops(kind: Kind, m: number, M: number): Edge {
  if (kind === "fill") return { x0: 0, x1: 0, x2: 100, x3: 100, y0: 0, y1: 0, y2: 100, y3: 100 };
  const T = 1 + 2 * M;
  const at = (v: number) => (v / T) * 100;
  if (kind === "stacked") return { x0: at(M - m), x1: at(M), x2: at(M + 1), x3: at(M + 1 + m), y0: at(M - m), y1: at(M), y2: at(M + 1 - (m > 0 ? 0 : 0.1)), y3: at(M + 1 + m) };
  const inner = m > 0 ? 0 : 0.1;
  return { x0: at(M - m), x1: at(M + 0.3), x2: at(M + 1), x3: at(M + 1 + m), y0: at(M - m), y1: at(M + inner), y2: at(M + 1 - inner), y3: at(M + 1 + m) };
}

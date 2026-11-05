"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Box } from "../cards/morph";
import { wideNow } from "../env";
import { landingFogDefaults } from "../landing/settings";
import { BG, coverFrame, edgeBleed, useArtwork, zoomAt, type RGB, type Song } from "./art";
import { VARIANTS } from "./Backdrop";
import { defaults, PARAMS, type Params } from "./params";
import { calmAlpha, EMPTY_STAGE, edgeStops, isShown, kindOf, needsMove, READY_TIMEOUT_MS, sceneOrigin, stageReducer, TIMING, visibleBox, type Edge, type Kind, type Mode, type Pane, type Scene, type StageAction } from "./stage-model";
import { Fog, padSquare, type FogHandle } from "./variants";

/**
 * The backdrop behind every page (stage-model.ts has the rules): in the root layout, so it stays as pages come and go.
 * Pages say what to show (useStageScene); each scene key gets a pane of its own, built unseen under the one on screen
 * and faded in once it has drawn, so the window never goes dark between pages.
 */

export type StageActions = {
  /** Shows a scene: the same key keeps its pane (with these props), a new key builds a new pane to take over. */
  show: (scene: Scene) => void;
  /**
   * About to go to `next` (called on the click): starts the cover's move at once rather than when the page arrives.
   * Resolves once the move is running on screen (at once if there's no move): change the page then, so its rendering
   * doesn't hold up the move's first frames.
   */
  leave: (next: { mode: Mode; song: Song }) => Promise<void>;
  /** How long (ms) a page arriving now should wait before its own entrance: partway into a move, else 0. */
  entranceDelay: () => number;
  /** The page the last scene came from (asked by a page as it arrives, before it shows its own): null at first. */
  lastMode: () => Mode | null;
  /**
   * Calls `fn` once the scene `key` is fully on screen (its pane faded in: song to song, once the crossfade is over), or
   * soon if it already is. Returns a function that cancels it.
   */
  afterShown: (key: string, fn: () => void) => () => void;
  /**
   * What's behind `box` (CSS px in the window) on the scene `key`'s backdrop, on average, calm shade included, as drawn
   * now (even while it's still building unseen): null until it has drawn, or for styles that can't tell.
   */
  sampleBehind: (key: string, box: { left: number; top: number; width: number; height: number }) => RGB | null;
};

const Actions = createContext<StageActions | null>(null);

/** The stage's actions; the same object for the provider's whole life, so calling them never re-renders a page. */
export function useStage(): StageActions {
  const a = useContext(Actions);
  if (!a) throw new Error("useStage needs a StageProvider (app/layout.tsx)");
  return a;
}

/** Shows `scene` on the stage whenever it changes (a scene equal to the last is ignored, so fresh objects are fine). */
export function useStageScene(scene: Scene | null) {
  const { show } = useStage();
  useEffect(() => {
    if (scene) show(scene);
  });
}

/**
 * A page's own text or controls, faded up as the page arrives: partway into the cover's move when coming from another
 * page, at once otherwise (the delay is taken when it mounts: key it by song to replay it for each song).
 */
export function Entrance({ children, className = "", stayFrom }: { children: ReactNode; className?: string; stayFrom?: Mode }) {
  const { entranceDelay, lastMode } = useStage();
  // `stayFrom`: coming from that kind of page, it's already there (a song page's player, song to song): no entrance.
  const [delay] = useState(() => (stayFrom && lastMode() === stayFrom ? null : entranceDelay()));
  return (
    <div className={`${delay === null ? "" : "page-enter"} ${className}`} style={{ "--enter-delay": `${Math.round(delay ?? 0)}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// What keeps the content side calm, per page: a soft dim behind the landing wheel; on song pages a shade under the
// content (the bottom on portrait screens, the left on wide ones). stage-model.ts calmAlpha has the same stops.
const CALM: Record<Mode, string> = {
  landing: "bg-[radial-gradient(ellipse_70%_45%_at_center,rgba(13,11,10,0.5),transparent)]",
  song: "bg-[linear-gradient(to_bottom,transparent_35%,rgba(13,11,10,0.55))] wide:bg-[linear-gradient(to_right,rgba(13,11,10,0.5),transparent_55%)]",
};

type Move = {
  id: number;
  /** Where the cover is going: the page it belongs to. */
  target: Mode;
  /** That page has shown its scene (until then, the page being left may still re-render: its scenes are ignored). */
  arrived: boolean;
  done: boolean;
  /** The cover's square on screen at the start and at the end. */
  from: Box;
  to: Box;
  src: string;
  /** The cover as seen through the outgoing fog's mist (FogHandle.misted), carried instead of the clear cover so the
   * fog travels with it: no clear frame between the two fogs. Null for the other styles: the clear cover then. */
  snap: HTMLCanvasElement | null;
  /** How thick the outgoing fog had got; the incoming pane (ids from `firstPane` on) starts there. */
  thickness: number;
  firstPane: number;
  /** The opened song's cover, when it isn't the one on screen (the search bar can open a song before its cover is up). */
  next: string | null;
  /** How the page left and the page arrived at lay out their cover (their edge fade's shape). */
  fromKind: Kind;
  toKind: Kind;
  /** The margin round the cover square in the moving picture (a fraction of its side: the wider page's edge bleed),
   * and the edge fade at the start and at the end (edgeStops): the page left's, then exactly the fog's arriving. */
  margin: number;
  fromEdge: Edge;
  toEdge: Edge;
  /** The fog's brightness for its clear cover, on the page left and on the page arrived at. */
  fromDim: number;
  toDim: number;
  /** The fog's ambient glow round the cover (its `glow`), on each page. */
  fromGlow: number;
  toGlow: number;
  startedAt: number;
};

/** The stage's own side of its actions (for the Mover and the provider). */
type Internal = { moveDone: (id: number) => void; clearMove: () => void; started: (id: number) => void };

/** A CSS transform's scale (the scene's push-in): matrix(a, …) → a; none → 1. */
const scaleOf = (transform: string) => (transform.startsWith("matrix(") ? parseFloat(transform.slice(7)) || 1 : 1);

export function StageProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(stageReducer, EMPTY_STAGE);
  const [move, setMove] = useState<Move | null>(null);
  const stateRef = useRef(state);
  const moveRef = useRef<Move | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const lastParams = useRef<Partial<Record<Mode, Params>>>({});
  const lastMode = useRef<Mode | null>(null);
  const handles = useRef(new Map<number, { current: FogHandle | null }>());
  const waiters = useRef(new Map<number, () => void>()); // leave()s waiting for their move to be running
  const shownWaiters = useRef(new Set<{ key: string; fn: () => void }>()); // afterShown()s
  // Before the pages' own effects (which call show) see it.
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    for (const w of shownWaiters.current) {
      if (!isShown(state, w.key)) continue;
      shownWaiters.current.delete(w);
      w.fn();
    }
  }, [state]);
  // A move waits for its page's scene, ignoring the page being left; once the address changes, the page being left is
  // gone, so whatever shows next counts (the target page, or another one Back went to before the target showed).
  const pathname = usePathname();
  useEffect(() => {
    if (moveRef.current) moveRef.current.arrived = true;
  }, [pathname]);

  const actions = useMemo<StageActions>(() => {
    let ids = 0;
    const setBoth = (m: Move | null) => {
      moveRef.current = m;
      setMove(m);
    };
    // The cover moves to where `target`'s page has it, if that's somewhere else (between the landing page and a song):
    // from where it is on screen now (mid-move, wherever the moving cover has got to).
    const startMove = (target: Mode, song: Song, arrived: boolean): number | null => {
      const box = boxRef.current;
      const m = moveRef.current;
      if (!box || reducedMotion() || m?.target === target) return null;
      const W = box.clientWidth;
      const H = box.clientHeight;
      const wide = wideNow();
      const tf = coverFrame(W, H, target === "song" ? "beside" : "fill", wide);
      let from: Box;
      let src: string;
      let fromKind: Kind;
      let fromDim: number;
      let fromGlow: number;
      let snap: HTMLCanvasElement | null = null;
      let thickness = 0;
      let srcMargin = 0; // the page left's edge bleed, as a fraction of the cover's side
      let fromEdge: Edge | null = null;
      if (m && moverRef.current) {
        // The moving cover's box is the cover square (its margin overflows it).
        const r = moverRef.current.getBoundingClientRect();
        from = { left: r.left, top: r.top, width: r.width, height: r.height };
        [src, fromKind, fromDim, snap, thickness, fromGlow] = [m.next ?? m.src, m.toKind, m.toDim, m.next ? null : m.snap, m.thickness, m.toGlow];
        [srcMargin, fromEdge] = [m.next ? 0 : m.margin, m.next ? null : m.toEdge];
      } else {
        const out = [...stateRef.current.panes].reverse().find((p) => p.phase === "shown" || p.phase === "entering");
        if (!out || out.scene.mode === target) return null;
        const f = coverFrame(W, H, out.scene.layout, wide);
        if (!needsMove(f, tf)) return null;
        const scene = box.querySelector(`[data-pane="${out.id}"] [data-stage-scene]`);
        from = visibleBox(f, scene ? scaleOf(getComputedStyle(scene).transform) : 1, sceneOrigin(f, W, H));
        [src, fromKind, fromDim, fromGlow] = [out.scene.song.cover, kindOf(f), out.scene.params.brightness ?? 1, out.scene.params.glow ?? 0];
        const misted = handles.current.get(out.id)?.current?.misted() ?? null;
        if (misted) [snap, thickness, srcMargin] = [misted.canvas, misted.thickness, misted.pad / misted.cover];
      }
      const p = lastParams.current[target] ?? (target === "song" ? defaults(PARAMS.fog) : landingFogDefaults());
      const to = visibleBox(tf, zoomAt(0, p.zoom, p.zoomSecs), sceneOrigin(tf, W, H));
      // The page arrived at bleeds its cover past the square (a song page: Edge bleed), so the moving
      // cover grows the same margin on the way, built as the fog builds its own (padSquare) where the page left has a
      // narrower one; its edge fade goes from the page left's to exactly the fog's arriving, so nothing jumps when it
      // mists over.
      const tgtMargin = target === "song" ? edgeBleed(tf, H, p.bleed ?? 0) / tf.side : 0;
      let margin = srcMargin;
      if (snap && tgtMargin > srcMargin) {
        const cover = Math.round(snap.width / (1 + 2 * srcMargin));
        const inner = Math.round(srcMargin * cover);
        const square = Object.assign(document.createElement("canvas"), { width: cover, height: cover });
        square.getContext("2d")!.drawImage(snap, inner, inner, cover, cover, 0, 0, cover, cover);
        snap = padSquare(square, Math.round(tgtMargin * cover), ((p.edgeSoft ?? 0) / tf.side) * cover);
        margin = tgtMargin;
      }
      if (!snap) margin = 0;
      const next = song.cover !== src ? song.cover : null;
      const id = ++ids;
      const firstPane = stateRef.current.nextId;
      // The moving cover goes up first, still, under the outgoing pane (so nothing changes on screen), and starts moving
      // a frame later (Mover → started): the frame it goes up in is a heavy one (a big new layer to paint, the page's own
      // response to the click), and an animation is timed from the frame it starts in, so starting it there would skip
      // its first part, a visible stop and jump. The outgoing pane fades as it starts.
      const edges = { margin, fromEdge: fromEdge ?? edgeStops(fromKind, srcMargin, margin), toEdge: edgeStops(kindOf(tf), Math.min(tgtMargin, margin), margin) };
      setBoth({ id, target, arrived, done: false, from, to, src, snap, thickness, firstPane, next, fromKind, toKind: kindOf(tf), ...edges, fromDim, toDim: p.brightness ?? 1, fromGlow, toGlow: p.glow ?? 0, startedAt: performance.now() });
      // Whatever happens (the page never shows a scene: Back before it did, a cover that never loads), the move ends: the
      // moving cover never stays on screen.
      window.setTimeout(() => {
        if (moveRef.current?.id !== id) return;
        dispatch({ type: "moveDone" });
        setBoth(null);
      }, TIMING.move + READY_TIMEOUT_MS);
      return id;
    };
    return {
      show: (scene) => {
        lastParams.current[scene.mode] = scene.params;
        lastMode.current = scene.mode;
        const m = moveRef.current;
        if (m && !m.arrived) {
          if (scene.mode !== m.target) return; // the page being left, re-rendering on its way out
          m.arrived = true;
        }
        const known = stateRef.current.panes.some((p) => p.scene.key === scene.key && p.phase !== "leaving");
        if (!known) startMove(scene.mode, scene.song, true);
        dispatch({ type: "show", scene });
      },
      leave: (next) => {
        const id = startMove(next.mode, next.song, false);
        if (id === null) return Promise.resolve();
        // At most a little longer than a frame or two should take, whatever happens to the move.
        return new Promise<void>((resolve) => {
          waiters.current.set(id, resolve);
          window.setTimeout(resolve, 600);
        });
      },
      // The moving cover is moving: the outgoing pane fades, and a page waiting to change goes once the move's first
      // frame is surely on screen (two frames on).
      started: (id: number) => {
        const m = moveRef.current;
        if (!m || m.id !== id) return;
        m.startedAt = performance.now();
        dispatch({ type: "moveStart" });
        const resolve = waiters.current.get(id);
        waiters.current.delete(id);
        if (resolve) requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      },
      lastMode: () => lastMode.current,
      sampleBehind: (key, box) => {
        const pane = [...stateRef.current.panes].reverse().find((p) => p.scene.key === key && p.phase !== "leaving");
        const seen = pane && handles.current.get(pane.id)?.current?.sample(box);
        const el = boxRef.current;
        if (!pane || !seen || !el) return null;
        const a = calmAlpha(pane.scene.mode, wideNow(), box.left + box.width / 2, box.top + box.height / 2, el.clientWidth, el.clientHeight);
        return seen.map((c, i) => c * (1 - a) + BG[i] * a) as RGB;
      },
      afterShown: (key, fn) => {
        const w = { key, fn };
        if (isShown(stateRef.current, key)) queueMicrotask(() => shownWaiters.current.has(w) && (shownWaiters.current.delete(w), fn()));
        shownWaiters.current.add(w);
        return () => void shownWaiters.current.delete(w);
      },
      entranceDelay: () => {
        const m = moveRef.current;
        return m && !m.done ? Math.max(0, m.startedAt + TIMING.move * TIMING.entranceAt - performance.now()) : 0;
      },
      moveDone: (id: number) => {
        const m = moveRef.current;
        if (!m || m.id !== id) return;
        setBoth({ ...m, done: true });
        dispatch({ type: "moveDone" });
      },
      clearMove: () => setBoth(null),
    } as StageActions & Internal;
  }, []);
  const { moveDone, clearMove, started } = actions as StageActions & Internal;

  const top = state.panes[state.panes.length - 1];
  const mode = move?.target ?? top?.scene.mode ?? null;
  // The move is over once the page it went to is on screen: the moving cover goes.
  const landed = !!move?.done && top?.scene.mode === move.target && top.phase === "shown";
  useEffect(() => {
    if (landed) clearMove();
  }, [landed, clearMove]);

  return (
    <Actions.Provider value={actions}>
      {children}
      {/* As tall as the window with the browser's toolbars away (h-lvh), so the fog isn't rebuilt as they come and go.
          Bottom to top: the moving cover, the panes, the calm shade for the page's content. */}
      <div ref={boxRef} aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh bg-[#0d0b0a]">
        {move && <Mover key={move.id} move={move} elRef={moverRef} onStart={started} onDone={moveDone} />}
        {state.panes.map((pane) => (
          <PaneLayer
            key={pane.id}
            pane={pane}
            dispatch={dispatch}
            handles={handles}
            startThick={move && pane.id >= move.firstPane ? move.thickness : 0}
            enterMs={move ? TIMING.mistOver : TIMING.handover}
            leaveMs={move ? TIMING.dropsOut : TIMING.handover}
          />
        ))}
        {(Object.keys(CALM) as Mode[]).map((m) => (
          <div key={m} className={`absolute inset-0 transition-opacity duration-[600ms] ${CALM[m]} ${mode === m ? "opacity-100" : "opacity-0"}`} />
        ))}
      </div>
    </Actions.Provider>
  );
}

/**
 * The cover itself, as seen through the outgoing fog's mist, moving from where one page has it to where the next does:
 * laid out at the end, drawn over the start (a FLIP), eased there. Its feather grows or shrinks from one page's to the
 * other's, its brightness goes from one fog's to the other's, and if the opened song's cover isn't this one it fades in
 * on the way. A resize mid-move ends it
 * at once (the incoming fog, laid out for the new size, mists over it).
 */
function Mover({ move, elRef, onStart, onDone }: { move: Move; elRef: React.RefObject<HTMLDivElement | null>; onStart: (id: number) => void; onDone: (id: number) => void }) {
  const { from, to } = move;
  const masked = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const [nextIn, setNextIn] = useState(false);
  // The edge fade (globals.css .cover-edge-anim), as CSS variables.
  const fade = (e: Edge) => Object.fromEntries(Object.entries(e).map(([k, v]) => [`--${k}`, `${v.toFixed(3)}%`]));
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // The misted cover.
    const c = picture.current;
    if (c && move.snap) {
      c.width = c.height = move.snap.width;
      c.getContext("2d")!.drawImage(move.snap, 0, 0);
    }
    // The glow round it, as the fog draws it (drawBleed: the cover blurred, 1.4× its size): the cover drawn tiny and
    // scaled up, which blurs it for nothing. The misted cover is dimmed and the glow isn't, so it's lifted back.
    const g = glow.current;
    if (g && move.snap) {
      g.width = g.height = 24;
      g.getContext("2d")!.drawImage(move.snap, 0, 0, 24, 24);
    }
    const lift = 1 / (move.fromDim || 1);
    // The misted picture already has the outgoing fog's brightness; it goes to the incoming one's.
    const dim = move.snap ? [1, move.toDim / (move.fromDim || 1)] : [move.fromDim, move.toDim];
    const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
    // Up first, still, where the cover is now (see startMove); moving from the next frame but one.
    Object.assign(el.style, { transform: start, filter: `brightness(${dim[0]})` });
    let anims: (Animation | undefined)[] = [];
    const onResize = () => anims.forEach((x) => x?.finish());
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const opts = { duration: TIMING.move, easing: TIMING.moveEase, fill: "forwards" as const };
        const a = el.animate([{ transform: start, filter: `brightness(${dim[0]})` }, { transform: "none", filter: `brightness(${dim[1]})` }], opts);
        anims = [
          a,
          masked.current?.animate([fade(move.fromEdge), fade(move.toEdge)], opts),
          glow.current?.animate([{ opacity: Math.min(1, move.fromGlow * lift) }, { opacity: Math.min(1, move.toGlow * lift) }], opts),
        ];
        a.finished.then(() => onDone(move.id), () => {});
        window.addEventListener("resize", onResize);
        onStart(move.id);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      anims.forEach((x) => x?.cancel());
    };
    // Runs once: a new move is a new Mover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!move.next) return;
    let alive = true;
    const img = new Image();
    img.src = move.next;
    img.decode().then(() => alive && setNextIn(true), () => {});
    return () => {
      alive = false;
    };
  }, [move.next]);
  const img = "absolute inset-0 size-full object-cover";
  return (
    <div ref={elRef} className="absolute" style={{ left: to.left, top: to.top, width: to.width, height: to.height, transformOrigin: "0 0" }}>
      {move.snap && <canvas ref={glow} className="glow-fade absolute -inset-[20%] size-[140%]" style={{ opacity: Math.min(1, move.fromGlow / (move.fromDim || 1)) }} />}
      {/* The cover square with its margin round it (the picture is that much bigger than the box), faded at its edges. */}
      <div
        ref={masked}
        className="cover-edge-anim absolute"
        style={{ inset: `${-move.margin * 100}%`, ...fade(move.fromEdge) } as React.CSSProperties}
      >
        {move.snap ? (
          <canvas ref={picture} className={img} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the cover, already loaded
          <img src={move.src} alt="" className={img} />
        )}
        {move.next && (
          // The opened song's cover, softened to sit with the misted one until its own fog mists over.
          // eslint-disable-next-line @next/next/no-img-element -- the opened song's cover
          <img
            src={move.next}
            alt=""
            className="absolute object-cover blur-md transition-opacity duration-300"
            style={{ inset: `${(move.margin / (1 + 2 * move.margin)) * 100}%`, opacity: nextIn ? 1 : 0 }}
          />
        )}
      </div>
    </div>
  );
}

/** One scene's backdrop, faded in once it has drawn and out when another takes over. */
type PaneProps = {
  pane: Pane;
  dispatch: (a: StageAction) => void;
  /** Where each pane's FogHandle is kept, by pane id (the stage asks the outgoing one for its misted cover). */
  handles: { current: Map<number, { current: FogHandle | null }> };
  /** The fog's thickness to start at (carried over from the page left). */
  startThick: number;
  enterMs: number;
  leaveMs: number;
};

function PaneLayer({ pane, dispatch, handles, startThick, enterMs, leaveMs }: PaneProps) {
  const { id, scene, phase } = pane;
  const handleRef = useRef<FogHandle | null>(null);
  useEffect(() => {
    const map = handles.current;
    map.set(id, handleRef);
    return () => void map.delete(id);
  }, [handles, id]);
  const art = useArtwork(scene.song.cover, scene.song.coverKind);
  const layer = useRef<HTMLDivElement>(null);

  // Ready: the fog says so once it has drawn; other styles once their cover is in. Whatever happens, it takes over
  // after a while (a cover that never loads leaves the dark base, rather than the last page stuck on screen).
  useEffect(() => {
    const t = window.setTimeout(() => dispatch({ type: "ready", id }), READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [id, dispatch]);
  useEffect(() => {
    if (art && scene.variant !== "fog") dispatch({ type: "ready", id });
  }, [art, scene.variant, id, dispatch]);

  useLayoutEffect(() => {
    if (layer.current) layer.current.style.opacity = "0"; // built unseen
  }, []);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el || (phase !== "entering" && phase !== "leaving")) return;
    const to = phase === "entering" ? 1 : 0;
    const a = el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: reducedMotion() ? 0 : phase === "entering" ? enterMs : leaveMs, easing: "ease", fill: "forwards" });
    a.finished.then(
      () => {
        el.style.opacity = String(to);
        a.cancel();
        dispatch(phase === "entering" ? { type: "entered", id } : { type: "gone", id });
      },
      () => {}, // cancelled: a newer phase took over from where it was
    );
    return () => {
      if (a.playState !== "running") return;
      el.style.opacity = getComputedStyle(el).opacity; // hand the next animation the opacity it's at now
      a.cancel();
    };
    // Only a new phase starts an animation (the durations are read as it starts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, id, dispatch]);

  const V = VARIANTS.find((v) => v.key === scene.variant)!;
  return (
    <div ref={layer} data-pane={id} className="absolute inset-0">
      {art &&
        (scene.variant === "fog" ? (
          <Fog
            art={art}
            p={scene.params}
            song={scene.song}
            layout={scene.layout}
            hold={scene.hold}
            seed={scene.seed}
            onReady={() => dispatch({ type: "ready", id })}
            handleRef={handleRef}
            startThick={startThick}
          />
        ) : (
          <V.C art={art} p={scene.params} song={scene.song} />
        ))}
    </div>
  );
}

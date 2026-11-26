/**
 * One fog render, as the background worker runs it (fog-worker.ts) and as the main thread runs it when no worker is
 * available. Pure, so it's tested in Node.
 */
import { renderFog, type FogParams, type LensView } from "./fog-render";

/** `view`: the droplets drawn sharper, for the part of the pane the window shows (renderFog; beads.ts). */
export type FogJob = { id: number; src: Uint8ClampedArray; size: number; scale: number; params: FogParams; view?: LensView };
type Px = Uint8ClampedArray<ArrayBuffer>;
/** What the page needs (see renderFog): the scene through the mist, the droplets, the tiniest alone and the clear view. */
export type FogResult = { id: number; scene: Px; lenses: Px; specks: Px; clear: Px };

export function runFogJob(job: FogJob): FogResult {
  const { scene, lenses, specks, clear } = renderFog(job.src, job.size, job.scale, job.params, job.view);
  return { id: job.id, scene, lenses, specks, clear };
}

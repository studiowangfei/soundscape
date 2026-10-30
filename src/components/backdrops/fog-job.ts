/**
 * One fog render, as the background worker runs it (fog-worker.ts) and as the main thread runs it when no worker is
 * available. Pure, so it's tested in Node.
 */
import { renderFog, type FogParams } from "./fog-render";

export type FogJob = { id: number; src: Uint8ClampedArray; size: number; scale: number; params: FogParams };
export type FogResult = { id: number; fog: Uint8ClampedArray<ArrayBuffer>; mist: Uint8ClampedArray<ArrayBuffer>; clear: Uint8ClampedArray<ArrayBuffer> };

export function runFogJob(job: FogJob): FogResult {
  const { fog, mist, clear } = renderFog(job.src, job.size, job.scale, job.params);
  return { id: job.id, fog, mist, clear };
}

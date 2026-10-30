// Renders fog panes off the main thread (see fog-client.ts); the pixel buffers go back transferred, not copied.
import { runFogJob, type FogJob } from "./fog-job";

const scope = self as unknown as { onmessage: ((e: MessageEvent<FogJob>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const r = runFogJob(e.data);
  scope.postMessage(r, [r.fog.buffer, r.mist.buffer, r.clear.buffer]);
};

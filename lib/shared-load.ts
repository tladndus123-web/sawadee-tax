// One request at a time (speed, 2026-11-09): several parts of a screen asking for the same thing at the same moment
// (company settings ×3, my blocked branches ×2, month locks ×2, vendors ×2 on one page load) share the request that
// is already on its way instead of each sending their own. Nothing is kept once it has answered.

export function shared<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    if (!running) running = fn().finally(() => (running = null));
    return running;
  };
}

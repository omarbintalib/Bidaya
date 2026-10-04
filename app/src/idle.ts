/** Runs `fn` when the browser is idle (or after `timeout` ms at the latest); returns a cancel function. */
export function onIdle(fn: () => void, timeout = 1000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, Math.min(timeout, 250));
  return () => clearTimeout(id);
}

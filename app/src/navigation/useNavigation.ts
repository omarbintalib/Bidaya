import { useCallback, useEffect, useRef, useState } from 'react';
import { MOVED, pageFromPath, routeFor, type PageId } from './routes';

type Request = { page: PageId; source: 'push' | 'pop' | 'initial' };

// The URL and page are committed under an opaque cover. History requests can
// replace the target while covered, or queue a new pass during the reveal.
export function useNavigation(onCovered: () => void) {
  const [page, setPage] = useState<PageId>(() => {
    // Old links (e.g. /spread) keep working and show their new address.
    const moved = MOVED[window.location.pathname.replace(/\/$/, '')];
    if (moved) window.history.replaceState(window.history.state, '', moved);
    return pageFromPath(window.location.pathname);
  });
  const [busy, setBusy] = useState(true);
  const [run, setRun] = useState(0);
  const current = useRef(page);
  const active = useRef(true);
  const target = useRef<Request>({ page, source: 'initial' });
  const coveredCallback = useRef(onCovered);
  coveredCallback.current = onCovered;

  const request = useCallback((next: PageId, source: 'push' | 'pop' = 'push') => {
    if (active.current) {
      if (source === 'pop') target.current = { page: next, source };
      return;
    }
    if (next === current.current) {
      coveredCallback.current();
      return;
    }
    target.current = { page: next, source };
    active.current = true;
    setBusy(true);
    setRun(value => value + 1);
    // Dismiss the mobile keyboard before measuring the transition viewport.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, []);

  const commit = useCallback(() => {
    const destination = target.current;
    if (destination.source === 'push') {
      window.history.pushState({}, '', routeFor(destination.page).path);
      target.current = { ...destination, source: 'pop' };
    }
    current.current = destination.page;
    setPage(destination.page);
    coveredCallback.current();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const finish = useCallback(() => {
    if (target.current.page !== current.current) {
      setRun(value => value + 1);
      return;
    }
    active.current = false;
    setBusy(false);
  }, []);

  useEffect(() => {
    const onPop = () => request(pageFromPath(window.location.pathname), 'pop');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [request]);

  useEffect(() => {
    if (busy) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-page-heading]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [page, busy]);

  return { page, busy, run, request, commit, finish };
}

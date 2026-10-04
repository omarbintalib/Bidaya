import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import type { Locale } from '../i18n';

/** Mirror the page under a directional reveal, keeping the current reading section in place. */
export function useLanguageSwitch(locale: Locale, setLocale: Dispatch<SetStateAction<Locale>>, reducedMotion: boolean, navigating = false) {
  const desired = useRef(locale);
  const generation = useRef(0);
  const active = useRef<ViewTransition | null>(null);
  const fallback = useRef<Animation | null>(null);
  const releaseWait = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!reducedMotion && !navigating) return;
    if (navigating) generation.current++;
    active.current?.skipTransition();
    releaseWait.current?.();
    fallback.current?.cancel();
    delete document.documentElement.dataset.languageSweep;
    delete document.documentElement.dataset.readingRestore;
  }, [reducedMotion, navigating]);

  useEffect(() => () => {
    generation.current++;
    releaseWait.current?.();
    active.current?.skipTransition();
    fallback.current?.cancel();
    delete document.documentElement.dataset.languageSweep;
    delete document.documentElement.dataset.readingRestore;
  }, []);

  return useCallback(() => {
    const run = ++generation.current;
    const next = desired.current === 'ar' ? 'en' : 'ar';
    desired.current = next;
    releaseWait.current?.();
    active.current?.skipTransition();
    fallback.current?.cancel();
    active.current = null;
    const journeyAnchor = document.querySelector<HTMLElement>('.step.is-on[data-step]');
    if (journeyAnchor) {
      document.documentElement.dataset.readingRestore = 'true';
      window.dispatchEvent(new Event('journey-language-changing'));
    }
    const toolbarBottom = () => document.querySelector('.story-toolbar')?.getBoundingClientRect().bottom ?? 0;
    const anchor = journeyAnchor ?? [...document.querySelectorAll<HTMLElement>('.landing-hero, .landing-tour > section')].find(el => {
      const rect = el.getBoundingClientRect();
      return rect.top <= 80 && rect.bottom > 80;
    });
    const offset = anchor ? anchor.getBoundingClientRect().top - (journeyAnchor ? toolbarBottom() : 0) : undefined;
    const wasAtTop = window.scrollY < 2;
    const restoreReadingPosition = () => {
      if (anchor && offset !== undefined && (journeyAnchor || !wasAtTop)) {
        const delta = anchor.getBoundingClientRect().top - (journeyAnchor ? toolbarBottom() : 0) - offset;
        if (Math.abs(delta) > 1) window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
      }
    };
    const releaseReading = () => {
      if (journeyAnchor) window.dispatchEvent(new Event('journey-language-restored'));
      delete document.documentElement.dataset.readingRestore;
    };
    const waitAssets = () => {
      const visible = [...document.querySelectorAll<HTMLImageElement>('.landing-preview')].filter(img => {
        const r = img.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      });
      // Slow or unavailable assets must never hold the language transition indefinitely.
      return new Promise<void>(resolve => {
        let timer = 0;
        const finish = () => {
          window.clearTimeout(timer);
          if (releaseWait.current === finish) releaseWait.current = null;
          resolve();
        };
        releaseWait.current = finish;
        timer = window.setTimeout(finish, 800);
        void Promise.allSettled([document.fonts?.ready, ...visible.map(img => img.decode?.())]).then(finish);
      });
    };
    const finishReading = () => { if (run === generation.current) { restoreReadingPosition(); releaseReading(); } };
    const commit = () => {
      // A skipped transition can still invoke its update callback. Only the latest intent wins.
      if (run !== generation.current) return;
      flushSync(() => setLocale(next));
      restoreReadingPosition();
    };
    if (reducedMotion) {
      delete document.documentElement.dataset.languageSweep;
      commit();
      void waitAssets().then(finishReading);
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      document.documentElement.dataset.languageSweep = next;
      try {
        const transition = document.startViewTransition(async () => {
          commit();
          if (run !== generation.current) return;
          // Capture the translated preview after decoding, so the sweep never reveals an empty frame.
          await waitAssets();
          if (run === generation.current) restoreReadingPosition();
        });
        active.current = transition;
        void transition.ready.catch(() => {}); // Rapid toggles / hidden tabs may skip snapshots.
        void transition.finished.catch(() => {}).then(() => {
          if (run !== generation.current) return;
          restoreReadingPosition();
          releaseReading();
          active.current = null;
          delete document.documentElement.dataset.languageSweep;
        });
        return;
      } catch { /* Browsers that cannot create a snapshot use the lightweight fallback below. */ }
    }
    delete document.documentElement.dataset.languageSweep;
    commit();
    void waitAssets().then(finishReading);
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (workspace && typeof workspace.animate === 'function') {
      fallback.current = workspace.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
  }, [reducedMotion, setLocale]);
}

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
    active.current?.skipTransition();
    releaseWait.current?.();
    fallback.current?.cancel();
    delete document.documentElement.dataset.languageSweep;
  }, [reducedMotion, navigating]);

  useEffect(() => () => {
    generation.current++;
    releaseWait.current?.();
    active.current?.skipTransition();
    fallback.current?.cancel();
    delete document.documentElement.dataset.languageSweep;
  }, []);

  return useCallback(() => {
    const run = ++generation.current;
    const next = desired.current === 'ar' ? 'en' : 'ar';
    desired.current = next;
    releaseWait.current?.();
    active.current?.skipTransition();
    fallback.current?.cancel();
    active.current = null;
    const anchor = [...document.querySelectorAll<HTMLElement>('.landing-hero, .landing-tour > section')].find(el => {
      const rect = el.getBoundingClientRect();
      return rect.top <= 80 && rect.bottom > 80;
    });
    const offset = anchor?.getBoundingClientRect().top;
    const wasAtTop = window.scrollY < 2;
    const restoreReadingPosition = () => {
      if (anchor && offset !== undefined && !wasAtTop) {
        const delta = anchor.getBoundingClientRect().top - offset;
        if (Math.abs(delta) > 1) window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
      }
    };
    const commit = () => {
      // A skipped transition can still invoke its update callback. Only the latest intent wins.
      if (run !== generation.current) return;
      flushSync(() => setLocale(next));
      restoreReadingPosition();
    };
    if (reducedMotion) {
      delete document.documentElement.dataset.languageSweep;
      commit();
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      document.documentElement.dataset.languageSweep = next;
      try {
        const transition = document.startViewTransition(async () => {
          commit();
          if (run !== generation.current) return;
          // Capture the translated preview after decoding, so the sweep never reveals an empty frame.
          const visible = [...document.querySelectorAll<HTMLImageElement>('.landing-preview')].filter(img => {
            const r = img.getBoundingClientRect();
            return r.bottom > 0 && r.top < window.innerHeight;
          });
          // Slow or unavailable assets must never hold the language transition indefinitely.
          await new Promise<void>(resolve => {
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
          if (run === generation.current) restoreReadingPosition();
        });
        active.current = transition;
        void transition.ready.catch(() => {}); // Rapid toggles / hidden tabs may skip snapshots.
        void transition.finished.catch(() => {}).then(() => {
          if (run !== generation.current) return;
          active.current = null;
          delete document.documentElement.dataset.languageSweep;
        });
        return;
      } catch { /* Browsers that cannot create a snapshot use the lightweight fallback below. */ }
    }
    delete document.documentElement.dataset.languageSweep;
    commit();
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (workspace && typeof workspace.animate === 'function') {
      fallback.current = workspace.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
  }, [reducedMotion, setLocale]);
}

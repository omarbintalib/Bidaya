import { lazy, Suspense } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import type { Locale } from '../i18n';
import { routeFor } from '../navigation/routes';

/**
 * The story, map and data loader are the bulk of the app, so they load as a separate chunk.
 * The heading stays here so it is on screen (and focusable) as soon as the page opens.
 */
const loadContent = () => import('../journey/JourneyContent');
const JourneyContent = lazy(loadContent);
const loadingCopy = { ar: 'جارٍ تحميل بيانات السيرة…', en: 'Loading the Sirah data…' };

/** Starts downloading the Journey's code (and data) ahead of time. Safe to call repeatedly: both are cached. */
export function preloadJourney(withData = true) {
  loadContent().catch(() => { /* The page retries when it opens. */ });
  if (withData) import('../data/load').then(m => m.getSirah()).catch(() => { /* getSirah forgets failures; the page retries. */ });
}

export default function JourneyPage({ locale }: { locale: Locale }) {
  const { reducedMotion } = useAccessibility();
  const loading = <p className="data-status" role="status">{loadingCopy[locale]}</p>;
  return <main id="main-content" tabIndex={-1} className="explorer journey-page">
    <section className="intro">
      <h1 tabIndex={-1} data-page-heading>{routeFor('journey')[locale].title}</h1>
      <p className="intro-subtitle">{locale === 'ar' ? 'اتبع فصول السيرة، واكتشف الأحداث على الخريطة.' : 'Follow the chapters of the Prophet’s life and discover events on the map.'}</p>
    </section>
    <Suspense fallback={loading}>
      <JourneyContent locale={locale} reducedMotion={reducedMotion} loading={loading} />
    </Suspense>
  </main>;
}

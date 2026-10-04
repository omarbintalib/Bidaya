import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { useSirah } from '../data/useSirah';
import type { Locale } from '../i18n';
import Story from '../journey/Story';
import { journeyCopy } from '../journey/copy';
import { routeFor } from '../navigation/routes';
import '../journey/journey.css';
import '../journey/story.css';

export default function JourneyPage({ locale }: { locale: Locale }) {
  const jtext = journeyCopy[locale];
  const state = useSirah();
  const { reducedMotion } = useAccessibility();
  return <main className="explorer journey-page">
    <section className="intro">
      <h1 tabIndex={-1} data-page-heading>{routeFor('journey')[locale].title}</h1>
      <p className="intro-subtitle">{locale === 'ar' ? 'اتبع فصول السيرة، واكتشف الأحداث على الخريطة.' : 'Follow the chapters of the Prophet’s life and discover events on the map.'}</p>
    </section>
    {state.status === 'ready' ? <Story data={state.data} locale={locale} reducedMotion={reducedMotion} />
      : <p className={`data-status${state.status === 'error' ? ' is-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>{state.status === 'error' ? jtext.error : jtext.loading}</p>}
  </main>;
}

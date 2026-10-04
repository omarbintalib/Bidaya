import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { useSirah } from '../data/useSirah';
import { copy, type Locale } from '../i18n';
import Story from '../journey/Story';
import { journeyCopy } from '../journey/copy';
import { routeFor } from '../navigation/routes';
import '../journey/journey.css';
import '../journey/story.css';

export default function JourneyPage({ locale, onToggleLocale }: { locale: Locale; onToggleLocale?: () => void }) {
  const text = copy[locale], jtext = journeyCopy[locale];
  const state = useSirah();
  const { reducedMotion } = useAccessibility();
  return <main className="explorer journey-page">
    <section className="intro">
      <p className="eyebrow"><span />{text.eyebrow}</p>
      <h1 tabIndex={-1} data-page-heading>{routeFor('journey')[locale].title}</h1>
      <p className="intro-subtitle">{text.subtitle}</p>
    </section>
    {state.status === 'ready' ? <Story data={state.data} locale={locale} reducedMotion={reducedMotion} onToggleLocale={onToggleLocale} />
      : <p className={`data-status${state.status === 'error' ? ' is-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>{state.status === 'error' ? jtext.error : jtext.loading}</p>}
  </main>;
}

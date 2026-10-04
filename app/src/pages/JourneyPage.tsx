import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { answer } from '../assistant/answer';
import MorphOrb from '../components/MorphOrb';
import { unplacedVerses } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import { useSirah } from '../data/useSirah';
import { copy, type Locale } from '../i18n';
import EventCard, { VerseItem } from '../journey/EventCard';
import Timeline from '../journey/Timeline';
import { journeyCopy } from '../journey/copy';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { routeFor } from '../navigation/routes';
import '../journey/journey.css';

const FIRST_REVELATION = 12; // Dorar event number — where the deck's scope begins
const STORY_MS = 5200;

export default function JourneyPage({ locale }: { locale: Locale }) {
  const text = copy[locale], jtext = journeyCopy[locale];
  const state = useSirah();
  return <main className="explorer journey-page">
    <section className="intro">
      <p className="eyebrow"><span />{text.eyebrow}</p>
      <h1 tabIndex={-1} data-page-heading>{routeFor('journey')[locale].title}</h1>
      <p className="intro-subtitle">{text.subtitle}</p>
    </section>
    {state.status === 'ready' ? <Journey data={state.data} locale={locale} />
      : <p className={`data-status${state.status === 'error' ? ' is-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>{state.status === 'error' ? jtext.error : jtext.loading}</p>}
  </main>;
}

function Journey({ data, locale }: { data: Sirah; locale: Locale }) {
  const { reducedMotion } = useAccessibility();
  const jtext = journeyCopy[locale];
  const events = data.events;
  const [index, setIndex] = useState(() => Math.max(0, events.findIndex(e => e.n === FIRST_REVELATION)));
  const [playing, setPlaying] = useState(false);
  const current = events[index];

  useEffect(() => {
    if (!playing) return;
    if (index >= events.length - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setIndex(i => i + 1), STORY_MS);
    return () => window.clearTimeout(id);
  }, [playing, index, events.length]);

  const goTo = useCallback((i: number) => { setPlaying(false); setIndex(i); }, []);
  const selectEvent = useCallback((n: number) => {
    const i = events.findIndex(e => e.n === n);
    if (i >= 0) goTo(i);
  }, [events, goTo]);

  // The map grows with the story: this Hijri year in ink, earlier years faded, later years hidden.
  const emphasis = useCallback((e: SirahEvent): Emphasis => {
    if (e.n === current.n) return 'selected';
    if (e.order > current.order) return 'hidden';
    return e.year === current.year && e.period === current.period ? 'active' : 'past';
  }, [current]);
  const activeRoutes = useMemo(() => data.routes.filter(r => r.events.includes(current.n)).map(r => r.id), [data, current]);
  const unplaced = useMemo(() => unplacedVerses(data), [data]);

  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const onAsk = useCallback((question: string) => {
    const result = answer(data, question, locale);
    if (result.event !== undefined) window.setTimeout(() => selectEvent(result.event!), 300);
    return result.text;
  }, [data, locale, selectEvent]);

  return <>
    <div className="journey-grid">
      <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={current.n} activeRoutes={activeRoutes} onSelect={selectEvent} reducedMotion={reducedMotion} focusKey={index} />
      <aside className="journey-panel" aria-live="polite">
        <EventCard key={`${current.n}-${locale}`} data={data} event={current} locale={locale} />
        <details className="unplaced">
          <summary>{jtext.unplaced} <span className="count">{unplaced.length}</span></summary>
          <p>{jtext.unplacedNote}</p>
          <ul className="verses is-compact">{unplaced.map(v => <VerseItem key={v.id} v={v} locale={locale} compact />)}</ul>
        </details>
      </aside>
    </div>
    <Timeline events={events} index={index} locale={locale} playing={playing} reducedMotion={reducedMotion} onIndex={goTo} onTogglePlay={() => setPlaying(p => !p)} />
    <section className="ai-region" aria-labelledby="ask-title">
      <MorphOrb locale={locale} reducedMotion={reducedMotion} onSubmit={onAsk} minThinkMs={900} ask={ask} />
      <div className="ai-foot">
        <h2 className="ai-title" id="ask-title">{jtext.ask}</h2>
        <p className="ai-note">{jtext.askNote}</p>
        <ul className="ai-suggest" aria-label={jtext.tryAsking}>
          {jtext.suggestions.map(q => <li key={q}><button type="button" onClick={() => setAsk({ text: q, key: Date.now() })}>{q}</button></li>)}
        </ul>
      </div>
    </section>
  </>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { answer } from '../assistant/answer';
import MorphOrb from '../components/MorphOrb';
import { hijri, PERIOD_ORDER, periodName, unplacedVerses } from '../data/select';
import type { Person, Sirah, SirahEvent, Verse } from '../data/types';
import { useSirah } from '../data/useSirah';
import { copy, type Locale } from '../i18n';
import EventCard, { VerseItem } from '../journey/EventCard';
import Timeline from '../journey/Timeline';
import { journeyCopy } from '../journey/copy';
import { PeopleProvider, PersonDialog } from '../journey/People';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { routeFor } from '../navigation/routes';
import '../journey/journey.css';

const FIRST_REVELATION = 12; // Dorar event number — where the deck's scope begins
const STORY_MS = 5200;
const CHAPTER_MS = 2200; // extra time in story mode when a new chapter opens
const CARD_W = 440;

function useWide() {
  const query = '(min-width: 1001px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

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
    const nextChapter = events[index + 1]?.period !== current.period;
    const id = window.setTimeout(() => setIndex(i => i + 1), STORY_MS + (nextChapter ? CHAPTER_MS : 0));
    return () => window.clearTimeout(id);
  }, [playing, index, events, current.period]);

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

  const [person, setPerson] = useState<Person | null>(null);
  const peopleApi = useMemo(() => ({ data, open: setPerson }), [data]);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const onAsk = useCallback((question: string) => {
    const result = answer(data, question, locale);
    if (result.event !== undefined) window.setTimeout(() => selectEvent(result.event!), 300);
    return result.text;
  }, [data, locale, selectEvent]);

  const wide = useWide();
  const chapter = PERIOD_ORDER.indexOf(current.period) + 1;
  const yearEvents = useMemo(() => events.filter(e => e.year === current.year && e.period === current.period), [events, current]);
  const reached = useMemo(() => {
    const by = (n: number | null) => n !== null && (data.byNumber.get(n)?.order ?? Infinity) <= current.order;
    return [...data.places.values()].filter(p => by(p.reached)).length + data.labels.filter(l => by(l.reached)).length;
  }, [data, current]);
  // A title card when the story enters a new chapter (period).
  const [chapterCard, setChapterCard] = useState<number | null>(null);
  const lastChapter = useRef(chapter);
  useEffect(() => {
    if (chapter === lastChapter.current) return;
    lastChapter.current = chapter;
    setChapterCard(chapter);
    const id = window.setTimeout(() => setChapterCard(null), reducedMotion ? 1200 : 2600);
    return () => window.clearTimeout(id);
  }, [chapter, reducedMotion]);
  const [undatedOpen, setUndatedOpen] = useState(false);

  const card = <EventCard key={`${current.n}-${locale}`} data={data} event={current} locale={locale} chapter={chapter} yearEvents={yearEvents} onPick={selectEvent} />;

  return <PeopleProvider value={peopleApi}>
    <div className="story">
      <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={current.n} activeRoutes={activeRoutes} onSelect={selectEvent}
        reducedMotion={reducedMotion} focusKey={index} now={current.order} inset={wide ? CARD_W + 32 : 0}>
        <div className="story-banner" data-map-overlay aria-hidden="true">
          <span className="story-chapter">{jtext.chapter(chapter)}</span>
          <b>{periodName[locale][current.period]}</b>
          <span>{hijri(current.year, locale)}</span>
          {reached > 0 && <span className="story-reach"><i />{jtext.reachedCount(reached)}</span>}
        </div>
        {chapterCard !== null && <div className="chapter-card" key={chapterCard} role="status">
          <span>{jtext.chapter(chapterCard)}</span>
          <strong>{periodName[locale][PERIOD_ORDER[chapterCard - 1]]}</strong>
        </div>}
        {wide && <aside className="story-card" data-map-overlay aria-live="polite">{card}</aside>}
      </HistoricMap>
      {!wide && <aside className="journey-panel" aria-live="polite">{card}</aside>}
    </div>
    <Timeline events={events} index={index} locale={locale} playing={playing} reducedMotion={reducedMotion} onIndex={goTo} onTogglePlay={() => setPlaying(p => !p)}
      extra={<button type="button" className="tl-btn tl-undated" aria-haspopup="dialog" onClick={() => setUndatedOpen(true)}>{jtext.undated(unplaced.length)}</button>} />
    {undatedOpen && <UndatedDialog verses={unplaced} locale={locale} onClose={() => setUndatedOpen(false)} />}
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
    {person && <PersonDialog key={person.id} person={person} data={data} locale={locale} onClose={() => setPerson(null)} onEvent={selectEvent} />}
  </PeopleProvider>;
}

/** Verses the sources link to no event: kept off the timeline, opened on request. */
function UndatedDialog({ verses, locale, onClose }: { verses: Verse[]; locale: Locale; onClose: () => void }) {
  const text = journeyCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  return <dialog ref={dialog} className="person-dialog undated-dialog" aria-labelledby="undated-title" onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="pd-head">
      <div><h2 id="undated-title">{text.unplaced}</h2><p className="pd-ar">{text.unplacedNote}</p></div>
      <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
    </header>
    <div className="pd-body"><ul className="verses is-compact">{verses.map(v => <VerseItem key={v.id} v={v} locale={locale} compact />)}</ul></div>
  </dialog>;
}

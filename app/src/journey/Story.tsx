import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { answer } from '../assistant/answer';
import MorphOrb from '../components/MorphOrb';
import { digits, hijri, PERIOD_ORDER, periodName, unplacedVerses } from '../data/select';
import type { Person, Period, QuizQuestion, Route, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { journeyCopy } from './copy';
import EventCard, { VerseItem } from './EventCard';
import Intro from './Intro';
import { createActiveStore, useActive, type ActiveStore } from './activeStore';
import { PeopleProvider, PersonDialog } from './People';
import Timeline from './Timeline';

/**
 * The Journey as a scroll-driven story: a column of steps (chapter openings, events, a question at the
 * end of each chapter, and a closing summary) beside a map that stays in view and follows the step
 * crossing the middle of the screen.
 */

type Step =
  | { kind: 'chapter'; period: Period; chapter: number; first: number }
  | { kind: 'event'; index: number }
  | { kind: 'quiz'; q: QuizQuestion; chapter: number; last: number }
  | { kind: 'summary' };

const STORY_MS = 5200;
const CHAPTER_MS = 2800;
const PROGRESS_KEY = 'bidaya.journey.v1';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setMatch(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

/** Answers and visited places are kept in this browser only, so a reload keeps the viewer's progress. */
function loadProgress(): { answers: Record<string, string>; seen: number[] } {
  try { const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? ''); if (v && typeof v === 'object') return { answers: v.answers ?? {}, seen: v.seen ?? [] }; } catch { /* storage unavailable */ }
  return { answers: {}, seen: [] };
}

export default function Story({ data, locale, reducedMotion, onToggleLocale }: { data: Sirah; locale: Locale; reducedMotion: boolean; onToggleLocale?: () => void }) {
  const text = journeyCopy[locale];
  const events = data.events;
  const wide = useMedia('(min-width: 1001px)');
  const [intro, setIntro] = useState(() => { try { return sessionStorage.getItem('bidaya.intro.seen') !== '1'; } catch { return true; } });
  // Build the story (≈150 steps and the map) once the opening has played, so the opening stays smooth.
  const [built, setBuilt] = useState(!intro);
  useEffect(() => {
    if (built) return;
    const id = window.setTimeout(() => setBuilt(true), reducedMotion ? 300 : 3400);
    return () => window.clearTimeout(id);
  }, [built, reducedMotion]);

  const steps = useMemo(() => {
    const out: Step[] = [];
    PERIOD_ORDER.forEach((period, p) => {
      const idx = events.map((e, i) => (e.period === period ? i : -1)).filter(i => i >= 0);
      if (!idx.length) return;
      out.push({ kind: 'chapter', period, chapter: p + 1, first: idx[0] });
      idx.forEach(index => out.push({ kind: 'event', index }));
      data.quiz.filter(q => q.period === period).forEach(q => out.push({ kind: 'quiz', q, chapter: p + 1, last: idx[idx.length - 1] }));
    });
    out.push({ kind: 'summary' });
    return out;
  }, [events, data.quiz]);
  const stepOfEvent = useMemo(() => new Map(steps.flatMap((s, i) => (s.kind === 'event' ? [[s.index, i] as const] : []))), [steps]);

  const [active, setActive] = useState(0);
  const step = steps[active];
  const index = step.kind === 'event' ? step.index : step.kind === 'chapter' ? step.first : step.kind === 'quiz' ? step.last : events.length - 1;
  const current = events[index];
  // Long lists (steps, timeline ticks) follow these stores instead of re-rendering on every move.
  const [stepStore] = useState(() => createActiveStore(0));
  const [eventStore] = useState(() => createActiveStore(index));
  useLayoutEffect(() => { stepStore.set(active); eventStore.set(index); }, [active, index, stepStore, eventStore]);
  const chapter = PERIOD_ORDER.indexOf(current.period) + 1;

  // ── progress ──
  const [progress, setProgress] = useState(loadProgress);
  const loaded = useRef(progress);
  useEffect(() => {
    if (progress === loaded.current) return; // nothing new to save
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
  }, [progress]);
  useEffect(() => {
    if (step.kind !== 'event' || progress.seen.includes(current.n)) return;
    setProgress(p => ({ ...p, seen: [...p.seen, current.n] }));
  }, [step.kind, current.n, progress.seen]);

  // ── the step crossing the middle of the screen drives the map ──
  const column = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  useEffect(() => {
    const root = column.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      if (performance.now() < lockUntil.current) return;
      const hit = entries.filter(e => e.isIntersecting).map(e => Number((e.target as HTMLElement).dataset.step));
      if (hit.length) setActive(hit[hit.length - 1]);
    }, { rootMargin: wide ? '-48% 0px -48% 0px' : '-74% 0px -22% 0px' });
    root.querySelectorAll('[data-step]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [steps, wide, built]);

  const goToStep = useCallback((i: number, smooth = true) => {
    const target = Math.max(0, Math.min(steps.length - 1, i));
    const el = column.current?.querySelector<HTMLElement>(`[data-step="${target}"]`);
    // Glide to nearby steps; jump straight to far ones, so the story doesn't race through every step in between.
    const far = !el || Math.abs(el.getBoundingClientRect().top - window.innerHeight / 2) > window.innerHeight * 1.5;
    const glide = smooth && !reducedMotion && !far;
    lockUntil.current = performance.now() + (glide ? 1500 : 200);
    if (glide) window.addEventListener('scrollend', () => { lockUntil.current = performance.now() + 50; }, { once: true });
    setActive(target);
    el?.scrollIntoView?.({ block: wide ? 'center' : 'start', behavior: glide ? 'smooth' : 'instant' });
  }, [steps.length, reducedMotion, wide]);
  const onTimelineIndex = useCallback((i: number) => goToStep(stepOfEvent.get(i)!), [goToStep, stepOfEvent]);
  const goToEvent = useCallback((n: number) => {
    const i = events.findIndex(e => e.n === n);
    if (i >= 0) goToStep(stepOfEvent.get(i)!);
  }, [events, stepOfEvent, goToStep]);

  // ── story mode: advance one step at a time ──
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (active >= steps.length - 1) { setPlaying(false); return; }
    if (step.kind === 'quiz' && !progress.answers[step.q.id]) { setPlaying(false); return; } // wait for an answer
    const id = window.setTimeout(() => goToStep(active + 1), step.kind === 'chapter' ? CHAPTER_MS : STORY_MS);
    return () => window.clearTimeout(id);
  }, [playing, active, steps.length, step, progress.answers, goToStep]);

  // ── map state ──
  const emphasis = useCallback((e: SirahEvent): Emphasis => {
    if (step.kind === 'summary') return 'past';
    if (e.n === current.n && step.kind === 'event') return 'selected';
    if (e.order > current.order) return 'hidden';
    return e.year === current.year && e.period === current.period ? 'active' : 'past';
  }, [current, step.kind]);
  const activeRoutes = useMemo(() => step.kind === 'event' ? data.routes.filter(r => r.events.includes(current.n)).map(r => r.id) : [], [data, current, step.kind]);
  const now = step.kind === 'summary' ? Infinity : current.order;
  const reached = useMemo(() => {
    const by = (n: number | null) => n !== null && (data.byNumber.get(n)?.order ?? Infinity) <= now;
    return [...data.places.values()].filter(p => by(p.reached)).length + data.labels.filter(l => by(l.reached)).length;
  }, [data, now]);

  // ── route walk ──
  const [walk, setWalk] = useState<{ route: Route; stop: number } | null>(null);
  useEffect(() => { setWalk(null); }, [active]);
  const walkStops = walk ? data.stops.get(walk.route.id) ?? [] : [];
  const walkStop = walk ? walkStops[walk.stop] : null;
  const startWalk = useCallback((route: Route) => setWalk({ route, stop: 0 }), []);

  // ── chapter question ──
  const quizStep = step.kind === 'quiz' ? step : null;
  const answerQuiz = useCallback((q: QuizQuestion, key: string) => setProgress(p => (p.answers[q.id] ? p : { ...p, answers: { ...p.answers, [q.id]: key } })), []);

  // ── people, undated verses, ask ──
  const [person, setPerson] = useState<Person | null>(null);
  const peopleApi = useMemo(() => ({ data, open: setPerson }), [data]);
  const unplaced = useMemo(() => unplacedVerses(data), [data]);
  const [undatedOpen, setUndatedOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const closeAsk = useCallback(() => setAskOpen(false), []);
  const suggest = useCallback((q: string) => setAsk({ text: q, key: Date.now() }), []);
  const onAsk = useCallback((question: string) => {
    const result = answer(data, question, locale);
    if (result.event !== undefined) window.setTimeout(() => goToEvent(result.event!), 400);
    return result.text;
  }, [data, locale, goToEvent]);

  const begin = () => {
    try { sessionStorage.setItem('bidaya.intro.seen', '1'); } catch { /* storage unavailable */ }
    setBuilt(true);
    setIntro(false);
    window.requestAnimationFrame(() => goToStep(0));
  };

  const answered = data.quiz.filter(q => progress.answers[q.id]);
  const correct = answered.filter(q => progress.answers[q.id] === q.answer).length;
  const placesSeen = new Set(progress.seen.map(n => data.byNumber.get(n)?.place).filter(Boolean)).size;

  return <PeopleProvider value={peopleApi}>
    {intro && <Intro locale={locale} reducedMotion={reducedMotion} onBegin={begin} onSkip={() => { try { sessionStorage.setItem('bidaya.intro.seen', '1'); } catch { /* storage unavailable */ } setBuilt(true); setIntro(false); }} />}
    <nav className="story-toolbar" aria-label={text.toolbar}>
      <button type="button" className="tb-btn tb-start" onClick={() => { setPlaying(false); goToStep(0); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4v12M15 4 7 10l8 6z" fill="currentColor" /></svg>
        <span>{text.fromStart}</span>
      </button>
      <ol className="tb-chapters" aria-label={text.chapters}>
        {steps.flatMap((s, i) => s.kind === 'chapter' ? [<li key={s.period}>
          <button type="button" className={`tb-chapter${chapter === s.chapter && step.kind !== 'summary' ? ' is-now' : ''}${data.quiz.some(q => q.period === s.period && progress.answers[q.id]) ? ' is-done' : ''}`} aria-current={chapter === s.chapter && step.kind !== 'summary' ? 'step' : undefined}
            title={`${text.chapter(s.chapter)} · ${periodName[locale][s.period]}`} onClick={() => { setPlaying(false); goToStep(i); }}>
            <b>{digits(s.chapter, locale)}</b><span>{periodName[locale][s.period]}</span>
          </button>
        </li>] : [])}
      </ol>
      <div className="tb-end">
        <button type="button" className={`tb-btn tb-ask${askOpen ? ' is-open' : ''}`} aria-expanded={askOpen} aria-controls="ask-panel" onClick={() => setAskOpen(o => !o)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" /></svg>
          <span className="tb-long">{text.ask}</span><span className="tb-short">{text.askShort}</span>
        </button>
        {onToggleLocale && <button type="button" className="tb-btn tb-lang" onClick={onToggleLocale} lang={locale === 'ar' ? 'en' : 'ar'} aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" /><ellipse cx="10" cy="10" rx="3" ry="7" stroke="currentColor" /><path d="M3 10h14" stroke="currentColor" /></svg>
          <span className="tb-long">{locale === 'ar' ? 'English' : 'العربية'}</span><span className="tb-short">{locale === 'ar' ? 'EN' : 'ع'}</span>
        </button>}
      </div>
      <AskPanel open={askOpen} onClose={closeAsk} locale={locale} reducedMotion={reducedMotion} onAsk={onAsk} ask={ask} onSuggest={suggest} />
    </nav>
    {built && <div className="scrolly">
      <div className="scrolly-steps" ref={column}>
        <StepList steps={steps} data={data} locale={locale} store={stepStore} goToStep={goToStep} goToEvent={goToEvent} onWalk={startWalk} answers={progress.answers} onAnswer={answerQuiz} />
        <section data-step={steps.length - 1} className={`step step-summary${step.kind === 'summary' ? ' is-on' : ''}`}>
          <span>{text.summaryKicker}</span>
          <h2>{text.summaryTitle}</h2>
          <dl className="summary-stats">
            <div><dt>{text.statEvents}</dt><dd>{digits(progress.seen.length, locale)} / {digits(events.length, locale)}</dd></div>
            <div><dt>{text.statPlaces}</dt><dd>{digits(placesSeen, locale)}</dd></div>
            <div><dt>{text.statQuiz}</dt><dd>{digits(correct, locale)} / {digits(data.quiz.length, locale)}</dd></div>
            <div><dt>{text.statReached}</dt><dd>{digits(reached, locale)}</dd></div>
          </dl>
          <div className="summary-actions">
            <button type="button" className="btn-primary" onClick={() => goToStep(0)}>{text.restart}</button>
            <button type="button" className="btn-quiet" onClick={() => setAskOpen(true)}>{text.ask}</button>
          </div>
        </section>
      </div>

      <div className="scrolly-map">
        <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={step.kind === 'event' ? current.n : null} activeRoutes={activeRoutes}
          onSelect={goToEvent} reducedMotion={reducedMotion} focusKey={`${active}-${walk?.stop ?? ''}`} now={now} legend={false}
          overview={step.kind === 'summary' || step.kind === 'chapter' && step.chapter === 1}
          caravans={current.period === 'prologue' || current.period === 'makkah'} scrollPage
          walk={walk && walkStop ? { routeId: walk.route.id, lat: walkStop.lat, lon: walkStop.lon, key: `${walk.route.id}-${walk.stop}` } : null}
          quiz={quizStep ? { options: quizStep.q.options, answer: quizStep.q.answer, chosen: progress.answers[quizStep.q.id] ?? null, onPick: k => answerQuiz(quizStep.q, k) } : null}>
          <div className="story-banner" data-map-overlay aria-hidden="true">
            {step.kind === 'summary' ? <b>{text.summaryKicker}</b> : <><b>{periodName[locale][current.period]}</b><span>{hijri(current.year, locale)}</span></>}
            {reached > 0 && <span className="story-reach"><i />{text.reachedCount(reached)}</span>}
          </div>

          {walk && walkStop && <div className="walk-panel" data-map-overlay role="group" aria-label={walk.route.name[locale]}>
            <p className="walk-kicker">{walk.route.name[locale]} · {text.stopOf(walk.stop + 1, walkStops.length)}</p>
            <h3>{walkStop.name[locale]}</h3>
            <p className="walk-quote" lang="ar" dir="rtl">«{walkStop.quote}»</p>
            <a className="walk-source" href={walkStop.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {walkStop.event}</a>
            <div className="walk-nav">
              <button type="button" className="btn-quiet" disabled={walk.stop === 0} onClick={() => setWalk({ ...walk, stop: walk.stop - 1 })}>{text.prevStop}</button>
              {walk.stop < walkStops.length - 1
                ? <button type="button" className="btn-primary" onClick={() => setWalk({ ...walk, stop: walk.stop + 1 })}>{text.nextStop}</button>
                : <button type="button" className="btn-primary" onClick={() => setWalk(null)}>{text.endWalk}</button>}
            </div>
            <button type="button" className="walk-close" onClick={() => setWalk(null)} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
          </div>}

          <div className="story-timeline" data-map-overlay>
            <Timeline events={events} index={index} store={eventStore} locale={locale} playing={playing} reducedMotion={reducedMotion}
              onIndex={onTimelineIndex} onTogglePlay={() => setPlaying(p => !p)}
              extra={<button type="button" className="tl-btn tl-undated" aria-haspopup="dialog" onClick={() => setUndatedOpen(true)}>{text.undated(unplaced.length)}</button>} />
          </div>
        </HistoricMap>
      </div>
    </div>}
    {undatedOpen && <UndatedDialog verses={unplaced} locale={locale} onClose={() => setUndatedOpen(false)} />}
    {person && <PersonDialog key={person.id} person={person} data={data} locale={locale} onClose={() => setPerson(null)} onEvent={goToEvent} />}
  </PeopleProvider>;
}

/** All steps but the summary; memoised so it re-renders only when the steps, the language or an answer change. */
const StepList = memo(function StepList({ steps, data, locale, store, goToStep, goToEvent, onWalk, answers, onAnswer }: {
  steps: Step[]; data: Sirah; locale: Locale; store: ActiveStore; goToStep: (i: number) => void; goToEvent: (n: number) => void;
  onWalk: (route: Route) => void; answers: Record<string, string>; onAnswer: (q: QuizQuestion, key: string) => void;
}) {
  return <>{steps.map((s, i) => {
    if (s.kind === 'chapter') return <ChapterStep key={`c${s.chapter}`} s={s} i={i} store={store} events={data.events} locale={locale} />;
    if (s.kind === 'event') return <EventStep key={data.events[s.index].n} index={s.index} i={i} store={store} data={data} locale={locale} goToStep={goToStep} goToEvent={goToEvent} onWalk={onWalk} />;
    if (s.kind === 'quiz') return <QuizCard key={s.q.id} step={i} store={store} q={s.q} chapter={s.chapter} data={data} locale={locale} chosen={answers[s.q.id] ?? null} onAnswer={onAnswer} />;
    return null;
  })}</>;
});

/** The "Ask the map" panel; memoised so moving through the story leaves the orb untouched. */
const AskPanel = memo(function AskPanel({ open, onClose, locale, reducedMotion, onAsk, ask, onSuggest }: {
  open: boolean; onClose: () => void; locale: Locale; reducedMotion: boolean; onAsk: (q: string) => string; ask: { text: string; key: number } | null; onSuggest: (q: string) => void;
}) {
  const text = journeyCopy[locale];
  return <section id="ask-panel" className={`ask-panel${open ? ' is-open' : ''}`} aria-label={text.ask} inert={!open}>
    <div className="ask-head"><h2>{text.ask}</h2><button type="button" className="qr-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button></div>
    <MorphOrb locale={locale} reducedMotion={reducedMotion} onSubmit={onAsk} minThinkMs={900} ask={ask} />
    <p className="ai-note">{text.askNote}</p>
    <ul className="ai-suggest" aria-label={text.tryAsking}>
      {text.suggestions.map(q => <li key={q}><button type="button" onClick={() => onSuggest(q)}>{q}</button></li>)}
    </ul>
  </section>;
});

const ChapterStep = memo(function ChapterStep({ s, i, store, events, locale }: { s: Extract<Step, { kind: 'chapter' }>; i: number; store: ActiveStore; events: SirahEvent[]; locale: Locale }) {
  const text = journeyCopy[locale];
  const on = useActive(store, a => a === i);
  const inChapter = events.filter(e => e.period === s.period);
  return <section data-step={i} className={`step step-chapter${on ? ' is-on' : ''}`}>
    <span>{text.chapter(s.chapter)}</span>
    <h2>{periodName[locale][s.period]}</h2>
    <p>{text.chapterSpan(hijri(inChapter[0].year, locale), hijri(inChapter[inChapter.length - 1].year, locale), inChapter.length)}</p>
  </section>;
});

const EventStep = memo(function EventStep({ index, i, store, data, locale, goToStep, goToEvent, onWalk }: {
  index: number; i: number; store: ActiveStore; data: Sirah; locale: Locale; goToStep: (i: number) => void; goToEvent: (n: number) => void; onWalk: (route: Route) => void;
}) {
  const on = useActive(store, a => a === i);
  const e = data.events[index];
  const route = on ? data.routes.find(r => r.kind === 'sirah' && r.events.includes(e.n) && (data.stops.get(r.id)?.length ?? 0) > 0) ?? null : null;
  return <section data-step={i} className={`step step-event${on ? ' is-on' : ''}`} onClick={() => !on && goToStep(i)}>
    {on ? <EventCard data={data} event={e} locale={locale} chapter={PERIOD_ORDER.indexOf(e.period) + 1}
      yearEvents={data.events.filter(x => x.year === e.year && x.period === e.period)} onPick={goToEvent}
      onWalk={route ? () => onWalk(route) : undefined} walkName={route?.name[locale]} />
      : <div className="step-peek"><p className="step-date">{hijri(e.year, locale)} · {e.placeName[locale]}</p><h3>{e.title[locale] || e.title.ar}</h3></div>}
  </section>;
});

const QuizCard = memo(function QuizCard({ step, store, q, chapter, data, locale, chosen, onAnswer }: { step: number; store: ActiveStore; q: QuizQuestion; chapter: number; data: Sirah; locale: Locale; chosen: string | null; onAnswer: (q: QuizQuestion, key: string) => void }) {
  const on = useActive(store, a => a === step);
  const onPick = (key: string) => onAnswer(q, key);
  const text = journeyCopy[locale];
  const right = chosen === q.answer;
  return <section data-step={step} className={`step step-quiz${on ? ' is-on' : ''}`} aria-labelledby={`q-${q.id}`}>
    <span className="quiz-kicker">{text.quizKicker(chapter)}</span>
    <h2 id={`q-${q.id}`}>{q.question[locale]}</h2>
    {chosen === null && <p className="quiz-hint">{text.quizHint}</p>}
    <div className="quiz-options" role="group" aria-label={q.question[locale]}>
      {q.options.map(k => <button key={k} type="button" disabled={chosen !== null}
        className={chosen === null ? '' : k === q.answer ? 'is-right' : k === chosen ? 'is-wrong' : 'is-out'} onClick={() => onPick(k)}>
        {data.places.get(k)?.name[locale] ?? k}
      </button>)}
    </div>
    {chosen !== null && <div className="quiz-result" role="status">
      <p className="quiz-verdict">{right ? text.quizRight : text.quizWrong(data.places.get(q.answer)?.name[locale] ?? q.answer)}</p>
      <p>{q.explanation[locale]}</p>
      <blockquote lang="ar" dir="rtl">«{q.quote}»</blockquote>
      <a href={q.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {q.event}</a>
    </div>}
  </section>;
});

/** Verses the sources link to no event: kept off the timeline, opened on request. */
function UndatedDialog({ verses, locale, onClose }: { verses: Verse[]; locale: Locale; onClose: () => void }) {
  const text = journeyCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    // No close() on cleanup: in development React runs effects twice, and closing here would fire onClose
    // and dismiss the dialog the moment it opens. Removing the element on unmount closes it anyway.
  }, []);
  return <dialog ref={dialog} className="person-dialog undated-dialog" aria-labelledby="undated-title" onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="pd-head">
      <div><h2 id="undated-title">{text.unplaced}</h2><p className="pd-ar">{text.unplacedNote}</p></div>
      <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
    </header>
    <div className="pd-body"><ul className="verses is-compact">{verses.map(v => <VerseItem key={v.id} v={v} locale={locale} compact />)}</ul></div>
  </dialog>;
}

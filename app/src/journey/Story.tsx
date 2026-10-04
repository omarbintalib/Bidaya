import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { answer, suggestFor, warmUp } from '../assistant/answer';
import MorphOrb from '../components/MorphOrb';
import { quizPools } from '../data/quiz';
import { digits, hijri, PERIOD_ORDER, periodName, unplacedVerses } from '../data/select';
import type { Person, Period, QuizQuestion, Route, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { onIdle } from '../idle';
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
  | { kind: 'quiz'; period: Period; chapter: number; last: number }
  | { kind: 'summary' };

/** Asking the map for a quiz: "quiz me", "another question", "اختبرني", "سؤال آخر"… */
const QUIZ_ASK = /\bquiz\b|\btest me\b|another question|more questions|اختبرني|بسؤال آخر|سؤال[اًا]* آخر|[أا]سئلة [أا]خرى|المزيد من ال[أا]سئلة/i;

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
    // Build the Ask index while nothing else is happening — never during the opening scene.
    if (intro) return;
    return onIdle(() => warmUp(data), 4000);
  }, [data, intro]);
  useEffect(() => {
    if (built) return;
    const id = window.setTimeout(() => setBuilt(true), reducedMotion ? 300 : 3400);
    return () => window.clearTimeout(id);
  }, [built, reducedMotion]);

  // Each chapter asks one question at a time from its pool (quiz.csv first, then questions built from the events).
  const pools = useMemo(() => quizPools(data), [data]);
  const [quizAt, setQuizAt] = useState<Partial<Record<Period, number>>>({});
  const questionOf = useCallback((period: Period, answers: Record<string, string>) => {
    const pool = pools.get(period) ?? [];
    const at = quizAt[period] ?? Math.max(0, pool.findIndex(q => !answers[q.id]));
    return { q: pool[at], at, total: pool.length };
  }, [pools, quizAt]);

  const steps = useMemo(() => {
    const out: Step[] = [];
    PERIOD_ORDER.forEach((period, p) => {
      const idx = events.map((e, i) => (e.period === period ? i : -1)).filter(i => i >= 0);
      if (!idx.length) return;
      out.push({ kind: 'chapter', period, chapter: p + 1, first: idx[0] });
      idx.forEach(index => out.push({ kind: 'event', index }));
      if (pools.get(period)?.length) out.push({ kind: 'quiz', period, chapter: p + 1, last: idx[idx.length - 1] });
    });
    out.push({ kind: 'summary' });
    return out;
  }, [events, pools]);
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
  const activeRef = useRef(active);
  activeRef.current = active;
  /** Where the newly active step sat before it opened, so the page can be held still while cards resize. */
  const anchor = useRef<{ step: number; top: number } | null>(null);
  const rush = useRef(0);
  // The Ask panel opens over the story column, never over the map: it takes the column's width from here.
  useLayoutEffect(() => {
    const col = column.current, page = col?.closest<HTMLElement>('.journey-page');
    if (!col || !page) return;
    const ro = new ResizeObserver(() => page.style.setProperty('--story-w', `${Math.round(col.getBoundingClientRect().width)}px`));
    ro.observe(col);
    return () => ro.disconnect();
  }, [built]);
  useEffect(() => {
    const root = column.current;
    if (!root) return;
    // Each frame the page scrolls, the step under the reading line becomes active. Measuring positions (rather
    // than waiting for a thin band to be crossed) means no step is passed over, however fast the scroll.
    let frame = 0;
    const pick = () => {
      frame = 0;
      if (performance.now() < lockUntil.current) return;
      const line = window.innerHeight * (wide ? 0.5 : 0.76);
      let best: HTMLElement | null = null, bestTop = 0, gap = Infinity;
      for (const el of root.querySelectorAll<HTMLElement>('[data-step]')) {
        const r = el.getBoundingClientRect();
        if (r.top <= line && r.bottom >= line) { best = el; bestTop = r.top; break; }
        const d = Math.min(Math.abs(r.top - line), Math.abs(r.bottom - line));
        if (d < gap) { gap = d; best = el; bestTop = r.top; }
        if (r.top > line) break;
      }
      const n = best ? Number(best.dataset.step) : -1;
      if (n < 0 || n === activeRef.current) return;
      anchor.current = { step: n, top: bestTop };
      setActive(n);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [steps, wide, built]);

  const goToStep = useCallback((i: number, smooth = true) => {
    const target = Math.max(0, Math.min(steps.length - 1, i));
    const el = column.current?.querySelector<HTMLElement>(`[data-step="${target}"]`);
    // Glide to nearby steps; jump straight to far ones, so the story doesn't race through every step in between.
    const far = !el || Math.abs(el.getBoundingClientRect().top - window.innerHeight / 2) > window.innerHeight * 1.5;
    const glide = smooth && !reducedMotion && !far;
    const dash = smooth && !reducedMotion && far;
    cancelAnimationFrame(rush.current);
    column.current?.classList.remove('is-rushing');
    lockUntil.current = performance.now() + (glide ? 1500 : dash ? 2000 : 200);
    if (glide) window.addEventListener('scrollend', () => { lockUntil.current = performance.now() + 50; }, { once: true });
    anchor.current = null;
    setActive(target);
    // Scroll once the cards have opened and closed, so the jump is measured against the final layout. Every jump
    // puts the step's top at the same place (its scroll-margin), however tall its card.
    window.requestAnimationFrame(() => {
      if (!el) return;
      if (!dash) { el.scrollIntoView?.({ block: 'start', behavior: glide ? 'smooth' : 'instant' }); return; }
      // Far jumps (chapters, the timeline): a quick dash down the page, so the reader sees the story pass by.
      const from = window.scrollY, margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const to = Math.max(0, el.getBoundingClientRect().top + from - margin);
      const D = Math.min(900, 420 + Math.abs(to - from) / 60), start = performance.now();
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      lockUntil.current = start + D + 300;
      column.current?.classList.add('is-rushing');
      const finish = () => {
        cancelAnimationFrame(rush.current);
        column.current?.classList.remove('is-rushing');
        lockUntil.current = performance.now() + 80;
        window.removeEventListener('wheel', finish); window.removeEventListener('touchstart', finish); window.removeEventListener('keydown', finish);
      };
      // The reader can take over at any moment: a wheel, touch or key stops the dash where it is.
      window.addEventListener('wheel', finish, { passive: true }); window.addEventListener('touchstart', finish, { passive: true }); window.addEventListener('keydown', finish);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        window.scrollTo({ top: from + (to - from) * ease(t), behavior: 'instant' });
        if (t < 1) rush.current = requestAnimationFrame(tick); else finish();
      };
      rush.current = requestAnimationFrame(tick);
    });
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
    if (step.kind === 'quiz' && !progress.answers[questionOf(step.period, progress.answers).q.id]) { setPlaying(false); return; } // wait for an answer
    const id = window.setTimeout(() => goToStep(active + 1), step.kind === 'chapter' ? CHAPTER_MS : STORY_MS);
    return () => window.clearTimeout(id);
  }, [playing, active, steps.length, step, progress.answers, goToStep, questionOf]);

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
  const quizNow = step.kind === 'quiz' ? questionOf(step.period, progress.answers).q : null;
  const answerQuiz = useCallback((q: QuizQuestion, key: string) => {
    // Keep this question on screen once answered, rather than moving on to the next unanswered one.
    setQuizAt(a => a[q.period] !== undefined ? a : { ...a, [q.period]: (pools.get(q.period) ?? []).indexOf(q) });
    setProgress(p => (p.answers[q.id] ? p : { ...p, answers: { ...p.answers, [q.id]: key } }));
  }, [pools]);
  /** The chapter's next unanswered question, if any is left. */
  const nextQuestion = useCallback((period: Period) => {
    const pool = pools.get(period) ?? [];
    const { at } = questionOf(period, progress.answers);
    for (let k = 1; k < pool.length; k++) {
      const i = (at + k) % pool.length;
      if (!progress.answers[pool[i].id]) return i;
    }
    return -1;
  }, [pools, questionOf, progress.answers]);
  const moreQuiz = useCallback((period: Period) => {
    const i = nextQuestion(period);
    if (i >= 0) setQuizAt(a => ({ ...a, [period]: i }));
  }, [nextQuestion]);

  // ── a quick question, any time: from the part of the story the reader has reached ──
  const [quick, setQuick] = useState<{ q: QuizQuestion | null; empty?: 'later' | 'done' } | null>(null);
  useEffect(() => { setQuick(null); }, [active]);
  const pickQuick = useCallback((skip?: string) => {
    const upTo = step.kind === 'summary' ? Infinity : current.order;
    const pool = step.kind === 'summary' ? [...pools.values()].flat() : pools.get(current.period) ?? [];
    const orderOf = (q: QuizQuestion) => data.byNumber.get(q.event)?.order ?? Infinity;
    const open = pool.filter(q => !progress.answers[q.id] && q.id !== skip);
    // Nearest to where the reader is first: the event they are on, then the ones just before it.
    const ready = open.filter(q => orderOf(q) <= upTo).sort((a, b) => orderOf(b) - orderOf(a));
    return ready.length ? { q: ready[0] } : { q: null, empty: open.length ? 'later' as const : 'done' as const };
  }, [step.kind, current, pools, data, progress.answers]);
  const openQuick = useCallback(() => { setWalk(null); setQuick(pickQuick()); }, [pickQuick]);
  const answerQuick = useCallback((q: QuizQuestion, key: string) => setProgress(p => (p.answers[q.id] ? p : { ...p, answers: { ...p.answers, [q.id]: key } })), []);

  // ── people, undated verses, ask ──
  const [person, setPerson] = useState<Person | null>(null);
  const peopleApi = useMemo(() => ({ data, open: setPerson }), [data]);
  const unplaced = useMemo(() => unplacedVerses(data), [data]);
  const [undatedOpen, setUndatedOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const closeAsk = useCallback(() => setAskOpen(false), []);
  const suggest = useCallback((q: string) => setAsk({ text: q, key: Date.now() }), []);
  // The ask bar's suggested question is about the current event, so its answer keeps the reader in place;
  // a typed question moves the story to the event it is about, like any other.
  const stay = useRef(false);
  const askAbout = useCallback((question?: string, keepPlace = false) => {
    setQuick(null);
    setAskOpen(true);
    if (question) { stay.current = keepPlace; suggest(question); }
  }, [suggest]);
  // One suggested question for where the reader is, worked out at idle time and shown in the ask bar.
  const [askHint, setAskHint] = useState<string | null>(null);
  useEffect(() => {
    setAskHint(null);
    if (step.kind !== 'event' || intro) return;
    return onIdle(() => setAskHint(suggestFor(data, current, locale, 1)[0] ?? null), 1500);
  }, [step.kind, current, data, locale, intro]);
  const onAsk = useCallback((question: string) => {
    if (QUIZ_ASK.test(question)) {
      // "Quiz me": a question on the map from where the reader is, or say plainly that none is left here.
      const next = pickQuick();
      setWalk(null);
      setQuick(next);
      if (next.q) window.setTimeout(() => setAskOpen(false), 1600);
      return next.q ? text.quizFromAsk : next.empty === 'later' ? text.quizLater : text.quizNoneLeft;
    }
    const result = answer(data, question, locale);
    const keep = stay.current;
    stay.current = false;
    if (result.event !== undefined && !keep) window.setTimeout(() => goToEvent(result.event!), 400);
    return result.text;
  }, [data, locale, goToEvent, pickQuick, text]);

  const begin = () => {
    try { sessionStorage.setItem('bidaya.intro.seen', '1'); } catch { /* storage unavailable */ }
    setBuilt(true);
    setIntro(false);
    window.requestAnimationFrame(() => goToStep(0));
  };

  const answered = [...pools.values()].flat().filter(q => progress.answers[q.id]);
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
          <button type="button" className={`tb-chapter${chapter === s.chapter && step.kind !== 'summary' ? ' is-now' : ''}${(pools.get(s.period) ?? []).some(q => progress.answers[q.id]) ? ' is-done' : ''}`} aria-current={chapter === s.chapter && step.kind !== 'summary' ? 'step' : undefined}
            title={`${text.chapter(s.chapter)} · ${periodName[locale][s.period]}`} onClick={() => { setPlaying(false); goToStep(i); }}>
            <b>{digits(s.chapter, locale)}</b><span>{periodName[locale][s.period]}</span>
          </button>
        </li>] : [])}
      </ol>
      <div className="tb-end">
        <button type="button" className={`tb-btn tb-quiz${quick ? ' is-open' : ''}`} aria-pressed={!!quick} aria-label={text.quizMe} onClick={() => (quick ? setQuick(null) : openQuick())}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7.8 8a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="10" cy="14.3" r=".9" fill="currentColor" /></svg>
          <span className="tb-long">{text.quizMe}</span>
        </button>
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
        <HoldStill store={stepStore} anchor={anchor} column={column} />
        <StepList steps={steps} data={data} locale={locale} store={stepStore} goToStep={goToStep} goToEvent={goToEvent} onWalk={startWalk} answers={progress.answers} onAnswer={answerQuiz} questionOf={questionOf} nextQuestion={nextQuestion} onMore={moreQuiz} />
        <section data-step={steps.length - 1} className={`step step-summary${step.kind === 'summary' ? ' is-on' : ''}`}>
          <span>{text.summaryKicker}</span>
          <h2>{text.summaryTitle}</h2>
          <dl className="summary-stats">
            <div><dt>{text.statEvents}</dt><dd>{digits(progress.seen.length, locale)} / {digits(events.length, locale)}</dd></div>
            <div><dt>{text.statPlaces}</dt><dd>{digits(placesSeen, locale)}</dd></div>
            <div><dt>{text.statQuiz}</dt><dd>{digits(correct, locale)} / {digits(answered.length, locale)}</dd></div>
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
          onSelect={goToEvent} reducedMotion={reducedMotion} inset={quick && wide ? 430 : 0} focusKey={`${active}-${walk?.stop ?? ''}`} now={now} legend={false}
          overview={step.kind === 'summary' || step.kind === 'chapter' && step.chapter === 1}
          caravans={current.period === 'prologue' || current.period === 'makkah'} scrollPage
          walk={walk && walkStop ? { routeId: walk.route.id, lat: walkStop.lat, lon: walkStop.lon, key: `${walk.route.id}-${walk.stop}` } : null}
          quiz={quick?.q ? { options: quick.q.options, answer: quick.q.answer, chosen: progress.answers[quick.q.id] ?? null, onPick: k => answerQuick(quick.q!, k) }
            : quizNow ? { options: quizNow.options, answer: quizNow.answer, chosen: progress.answers[quizNow.id] ?? null, onPick: k => answerQuiz(quizNow, k) } : null}>
          <div className="story-banner" data-map-overlay aria-hidden="true">
            {step.kind === 'summary' ? <b>{text.summaryKicker}</b> : <><b>{periodName[locale][current.period]}</b><span>{hijri(current.year, locale)}</span></>}
            {reached > 0 && <span className="story-reach"><i />{text.reachedCount(reached)}</span>}
          </div>

          {wide && !quick && !walk && !askOpen && <AskBar locale={locale} hint={askHint} onAsk={askAbout} />}

          {quick && wide && <QuickQuiz quick={quick} data={data} locale={locale} chosen={quick.q ? progress.answers[quick.q.id] ?? null : null}
            onAnswer={answerQuick} onNext={() => setQuick(pickQuick(quick.q?.id))} onClose={() => setQuick(null)} />}

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
    {quick && !wide && <QuickQuiz quick={quick} data={data} locale={locale} chosen={quick.q ? progress.answers[quick.q.id] ?? null : null}
      onAnswer={answerQuick} onNext={() => setQuick(pickQuick(quick.q?.id))} onClose={() => setQuick(null)} />}
    {undatedOpen && <UndatedDialog verses={unplaced} locale={locale} onClose={() => setUndatedOpen(false)} />}
    {person && <PersonDialog key={person.id} person={person} data={data} locale={locale} onClose={() => setPerson(null)} onEvent={goToEvent} />}
  </PeopleProvider>;
}

/**
 * When scrolling opens one card and closes the one above it, the page would shift by the difference and the
 * reading line would land a step or two further on. This runs after those cards re-render and scrolls by the
 * shift, so the step the reader reached stays exactly where it was.
 */
function HoldStill({ store, anchor, column }: { store: ActiveStore; anchor: React.RefObject<{ step: number; top: number } | null>; column: React.RefObject<HTMLDivElement | null> }) {
  const active = useActive(store, a => a);
  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held || held.step !== active) return;
    const el = column.current?.querySelector<HTMLElement>(`[data-step="${active}"]`);
    const shift = el ? el.getBoundingClientRect().top - held.top : 0;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
  }, [active, anchor, column]);
  return null;
}

/** All steps but the summary; memoised so it re-renders only when the steps, the language or an answer change. */
const StepList = memo(function StepList({ steps, data, locale, store, goToStep, goToEvent, onWalk, answers, onAnswer, questionOf, nextQuestion, onMore }: {
  steps: Step[]; data: Sirah; locale: Locale; store: ActiveStore; goToStep: (i: number) => void; goToEvent: (n: number) => void;
  onWalk: (route: Route) => void; answers: Record<string, string>; onAnswer: (q: QuizQuestion, key: string) => void;
  questionOf: (period: Period, answers: Record<string, string>) => { q: QuizQuestion; at: number; total: number };
  nextQuestion: (period: Period) => number; onMore: (period: Period) => void;
}) {
  return <>{steps.map((s, i) => {
    if (s.kind === 'chapter') return <ChapterStep key={`c${s.chapter}`} s={s} i={i} store={store} events={data.events} locale={locale} />;
    if (s.kind === 'event') return <EventStep key={data.events[s.index].n} index={s.index} i={i} store={store} data={data} locale={locale} goToStep={goToStep} goToEvent={goToEvent} onWalk={onWalk} />;
    if (s.kind === 'quiz') {
      const { q, at, total } = questionOf(s.period, answers);
      return <QuizCard key={`q${s.chapter}`} step={i} store={store} q={q} at={at} total={total} hasMore={nextQuestion(s.period) >= 0} chapter={s.chapter} data={data} locale={locale} chosen={answers[q.id] ?? null} onAnswer={onAnswer} onMore={onMore} goToStep={goToStep} />;
    }
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

/** Always on the map: type a question, or press Enter to ask the suggested one. */
function AskBar({ locale, hint, onAsk }: { locale: Locale; hint: string | null; onAsk: (question?: string, keepPlace?: boolean) => void }) {
  const text = journeyCopy[locale];
  const [q, setQ] = useState('');
  return <form className="ask-bar" data-map-overlay role="search" aria-label={text.ask} onSubmit={e => { e.preventDefault(); const typed = q.trim(); onAsk(typed || hint || undefined, !typed); setQ(''); }}>
    <svg className="ask-bar-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" /></svg>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder={hint ? text.askTry(hint) : text.askPlaceholder} aria-label={text.ask} enterKeyHint="send" />
    <button type="submit" aria-label={text.askSend}><svg viewBox="0 0 20 20" aria-hidden="true"><path d={locale === 'ar' ? 'M16 10H4m5-5-5 5 5 5' : 'M4 10h12m-5-5 5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
  </form>;
}

/** A question on the map, asked for at any point in the story. */
function QuickQuiz({ quick, data, locale, chosen, onAnswer, onNext, onClose }: {
  quick: { q: QuizQuestion | null; empty?: 'later' | 'done' }; data: Sirah; locale: Locale; chosen: string | null;
  onAnswer: (q: QuizQuestion, key: string) => void; onNext: () => void; onClose: () => void;
}) {
  const text = journeyCopy[locale];
  const { q } = quick;
  const name = (k: string) => data.places.get(k)?.name[locale] ?? k;
  return <div className="walk-panel quick-quiz" data-map-overlay role="group" aria-label={text.quizMe}>
    <p className="walk-kicker">{text.quickKicker}</p>
    {q ? <>
      <h3>{q.question[locale]}</h3>
      {chosen === null && <p className="quiz-hint">{text.quizHint}</p>}
      <div className="quiz-options is-compact" role="group" aria-label={q.question[locale]}>
        {q.options.map(k => <button key={k} type="button" disabled={chosen !== null}
          className={chosen === null ? '' : k === q.answer ? 'is-right' : k === chosen ? 'is-wrong' : 'is-out'} onClick={() => onAnswer(q, k)}>{name(k)}</button>)}
      </div>
      {chosen !== null && <div className="quick-result" role="status">
        <p className="quiz-verdict">{chosen === q.answer ? text.quizRight : text.quizWrong(name(q.answer))}</p>
        <p className="walk-quote" lang="ar" dir="rtl">«{q.quote}»</p>
        <a className="walk-source" href={q.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {q.event}</a>
      </div>}
      <div className="walk-nav">
        <button type="button" className={chosen === null ? 'btn-quiet' : 'btn-primary'} onClick={onNext}>{chosen === null ? text.quizSkip : text.quizMore}</button>
      </div>
    </> : <p className="quick-empty" role="status">{quick.empty === 'later' ? text.quizLater : text.quizNoneLeft}</p>}
    <button type="button" className="walk-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
  </div>;
}

const QuizCard = memo(function QuizCard({ step, store, q, at, total, hasMore, chapter, data, locale, chosen, onAnswer, onMore, goToStep }: {
  step: number; store: ActiveStore; q: QuizQuestion; at: number; total: number; hasMore: boolean; chapter: number; data: Sirah; locale: Locale;
  chosen: string | null; onAnswer: (q: QuizQuestion, key: string) => void; onMore: (period: Period) => void; goToStep: (i: number) => void;
}) {
  const on = useActive(store, a => a === step);
  const onPick = (key: string) => onAnswer(q, key);
  const text = journeyCopy[locale];
  const right = chosen === q.answer;
  return <section data-step={step} className={`step step-quiz${on ? ' is-on' : ''}`} aria-labelledby={`q-${q.id}`}>
    <span className="quiz-kicker">{text.quizKicker(chapter)}{total > 1 && <span className="quiz-count">{text.quizCount(at + 1, total)}</span>}</span>
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
    {total > 1 && (hasMore
      ? <button type="button" className={chosen === null ? 'quiz-more is-skip' : 'quiz-more'} onClick={() => { onMore(q.period); window.requestAnimationFrame(() => goToStep(step)); }}>{chosen === null ? text.quizSkip : text.quizMore}</button>
      : chosen !== null && <p className="quiz-done">{text.quizAllDone(total)}</p>)}
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

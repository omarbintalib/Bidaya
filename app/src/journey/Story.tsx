import AskIcon from '../components/AskIcon';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { answer, answerEvent, askServer, suggestFor, warmUp, type Answer } from '../assistant/answer';
import MorphOrb from '../components/MorphOrb';
import { quizPools } from '../data/quiz';
import { digits, eventPlaceName, hijri, PERIOD_ORDER, periodName, unplacedVerses, verseEvent, versesFor } from '../data/select';
import type { Person, Period, QuizQuestion, Route, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { onIdle } from '../idle';
import { journeyCopy } from './copy';
import EventCard, { VerseItem } from './EventCard';
import { Ambience, type Scene } from '../sound/ambience';
import SoundMenu from './SoundMenu';
import SummaryFilm from './SummaryFilm';
import Intro from './Intro';
import { createActiveStore, useActive, type ActiveStore } from './activeStore';
import { PeopleProvider, PersonDialog } from './People';
import Timeline from './Timeline';
import ChatHistory, { chatCopy } from './ChatHistoryPanel';
import { useChatHistory } from './chatHistory';
import { loadProgress, freshProgress, PROGRESS_KEY } from './progress';
import AnswerActions from './AnswerActions';
import PlaceCard from './PlaceCard';
import Search from './Search';
import type { SearchResult } from '../data/search';
import { pathKm, roundKm } from '../data/geo';

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
/** Story mode's pace: time per word of an event's text (about 140, 200 and 300 words a minute), plus a moment for the map. */
export type Pace = 'slow' | 'normal' | 'fast';
const MS_PER_WORD: Record<Pace, number> = { slow: 430, normal: 300, fast: 200 };
const LOOK_MS = 3000, MIN_EVENT_MS = 5000;
const PACE_KEY = 'bidaya.storyPace';
const SOUND_KEY = 'bidaya.sound', VOLUME_KEY = 'bidaya.soundLevel', DEFAULT_VOLUME = 0.5;

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
export default function Story({ data, locale, reducedMotion }: { data: Sirah; locale: Locale; reducedMotion: boolean }) {
  const text = journeyCopy[locale];
  const events = data.events;
  const [progress, setProgress] = useState(loadProgress);
  const [resume, setResume] = useState(() => progress.lastEvent !== undefined && data.byNumber.has(progress.lastEvent));
  const wide = useMedia('(min-width: 1001px)');
  const [intro, setIntro] = useState(() => { if (resume) return false; try { return sessionStorage.getItem('bidaya.intro.seen') !== '1'; } catch { return true; } });
  // Build the story (≈150 steps and the map) once the opening has played, so the opening stays smooth.
  const [built, setBuilt] = useState(!intro);
  useEffect(() => {
    // Build the Ask index while nothing else is happening — never during the opening scene.
    if (intro) return;
    return warmUp(data);
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
  const loaded = useRef(progress);
  useEffect(() => {
    if (progress === loaded.current) return; // nothing new to save
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
  }, [progress]);
  useEffect(() => {
    if (resume || intro || step.kind !== 'event' || (progress.lastEvent === current.n && progress.seen.includes(current.n))) return;
    setProgress(p => ({ ...p, lastEvent: current.n, seen: p.seen.includes(current.n) ? p.seen : [...p.seen, current.n] }));
  }, [step.kind, current.n, progress.seen, progress.lastEvent, resume, intro]);

  // ── the step crossing the middle of the screen drives the map ──
  const column = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const hold = () => { lockUntil.current = performance.now() + 350; };
    window.addEventListener('journey-language-restored', hold);
    return () => window.removeEventListener('journey-language-restored', hold);
  }, []);
  /** Where the newly active step sat before it opened, so the page can be held still while cards resize. */
  const anchor = useRef<{ step: number; top: number } | null>(null);
  const rush = useRef(0);
  // The map keeps the place in focus above the bottom controls (timeline and Ask bar), whatever their height.
  const timelineBox = useRef<HTMLDivElement>(null);
  // On phones the walk panel spans the bottom of the map: the map keeps the route above it.
  const walkPanel = useRef<HTMLDivElement>(null);
  const [walkPanelH, setWalkPanelH] = useState(0);
  useLayoutEffect(() => {
    const el = walkPanel.current;
    if (!el) { setWalkPanelH(0); return; }
    const ro = new ResizeObserver(() => setWalkPanelH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const [timelineH, setTimelineH] = useState(0);
  useLayoutEffect(() => {
    const el = timelineBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      setTimelineH(h);
      el.closest<HTMLElement>('.scrolly-map')?.style.setProperty('--timeline-h', `${h}px`); // the Ask bar floats just above it
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [built]);
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
    // The steps, in page order; read once per layout of the list rather than every frame.
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'));
    const pick = () => {
      frame = 0;
      if (resume || intro || document.documentElement.dataset.readingRestore === 'true' || performance.now() < lockUntil.current) return;
      // The last change has not been laid out and held still yet: positions measured now would be stale.
      if (anchor.current) { frame = requestAnimationFrame(pick); return; }
      const line = window.innerHeight * (wide ? 0.5 : 0.76);
      // Binary search for the last step whose top is at or above the reading line: a handful of measurements
      // per frame instead of one per step.
      let lo = 0, hi = els.length - 1, at = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (els[mid].getBoundingClientRect().top <= line) { at = mid; lo = mid + 1; } else hi = mid - 1;
      }
      let best = els[Math.max(0, at)] ?? null;
      if (best && at >= 0 && best.getBoundingClientRect().bottom < line && els[at + 1]) {
        // In a gap between two steps: take the nearer one.
        const below = els[at + 1], gapUp = line - best.getBoundingClientRect().bottom, gapDown = below.getBoundingClientRect().top - line;
        if (gapDown < gapUp) best = below;
      }
      const n = best ? Number(best.dataset.step) : -1;
      if (n < 0 || n === activeRef.current) return;
      anchor.current = { step: n, top: best!.getBoundingClientRect().top };
      setActive(n);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [steps, wide, built, resume, intro]);
  useEffect(() => {
    // Zooming or resizing the window reflows every card, so the step under the reading line would change by
    // itself. Hold the current step instead: no picking while the size changes, and the step kept in place.
    let size = { w: window.innerWidth, dpr: window.devicePixelRatio }, hold = 0, settle = 0;
    const keep = () => {
      hold = 0;
      const el = column.current?.querySelector<HTMLElement>(`[data-step="${activeRef.current}"]`);
      el?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    const onResize = () => {
      const next = { w: window.innerWidth, dpr: window.devicePixelRatio };
      // On a touch screen a change of height alone is the address bar or the keyboard: nothing reflows, so the
      // page is left where it is. Anywhere else (a window dragged taller, a zoom) the cards reflow.
      const reflow = next.w !== size.w || next.dpr !== size.dpr || !window.matchMedia('(pointer: coarse)').matches;
      size = next;
      lockUntil.current = Math.max(lockUntil.current, performance.now() + 400);
      if (!reflow) return;
      cancelAnimationFrame(rush.current); column.current?.classList.remove('is-rushing');
      if (!hold) hold = requestAnimationFrame(keep);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { keep(); lockUntil.current = performance.now() + 150; }, 300);
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(hold); window.clearTimeout(settle); window.removeEventListener('resize', onResize); };
  }, []);

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
        window.removeEventListener('wheel', finish); window.removeEventListener('touchstart', finish); window.removeEventListener('keydown', finish); window.removeEventListener('journey-language-changing', finish);
        window.dispatchEvent(new Event('story-settled'));
      };
      // The reader can take over at any moment: a wheel, touch or key stops the dash where it is.
      window.addEventListener('wheel', finish, { passive: true }); window.addEventListener('touchstart', finish, { passive: true }); window.addEventListener('keydown', finish); window.addEventListener('journey-language-changing', finish);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        window.scrollTo({ top: from + (to - from) * ease(t), behavior: 'instant' });
        if (t < 1) rush.current = requestAnimationFrame(tick); else finish();
      };
      rush.current = requestAnimationFrame(tick);
    });
  }, [steps.length, reducedMotion, wide]);
  // A click further along the timeline than the next event also offers the way back (set once returnTo exists below).
  const timelineJump = useRef<(from: number, to: number) => void>(() => {});
  const onTimelineIndex = useCallback((i: number) => { const to = stepOfEvent.get(i)!; timelineJump.current(activeRef.current, to); goToStep(to); }, [goToStep, stepOfEvent]);
  // The arrows move to the next (or previous) event in the story from wherever the reader is — so from a
  // chapter's opening, "next" is that chapter's first event, not the one after it.
  const stepEvent = useCallback((dir: 1 | -1) => {
    for (let i = activeRef.current + dir; i >= 0 && i < steps.length; i += dir) if (steps[i].kind === 'event') { goToStep(i); return; }
  }, [steps, goToStep]);
  const goToEvent = useCallback((n: number, smooth = true) => {
    const i = events.findIndex(e => e.n === n);
    if (i >= 0) goToStep(stepOfEvent.get(i)!, smooth);
  }, [events, stepOfEvent, goToStep]);

  // ── story mode: advance one step at a time ──
  const [playing, setPlaying] = useState(false);
  const [pace, setPaceState] = useState<Pace>(() => { try { const v = localStorage.getItem(PACE_KEY); return v === 'slow' || v === 'fast' ? v : 'normal'; } catch { return 'normal'; } });
  const setPace = useCallback((p: Pace) => { setPaceState(p); try { localStorage.setItem(PACE_KEY, p); } catch { /* not saved: fine */ } }, []);
  // Each event stays as long as its whole text takes to read at the chosen pace, plus a moment to look at the map.
  const stepMs = useMemo(() => {
    if (step.kind === 'chapter') return CHAPTER_MS;
    if (step.kind !== 'event') return STORY_MS;
    const e = events[step.index], body = (locale === 'en' && e.text.en) || e.text.ar, title = e.title[locale] || e.title.ar;
    const words = `${title} ${body}`.split(/\s+/).filter(Boolean).length;
    return Math.max(MIN_EVENT_MS, LOOK_MS + words * MS_PER_WORD[pace]);
  }, [step, events, locale, pace]);
  // ── background sound: field recordings per event (event_sounds.csv), off until the reader turns it on ──
  const ambience = useMemo(() => new Ambience(import.meta.env.BASE_URL), []);
  const [soundOn, setSoundOn] = useState(false);
  // Quiet by default: the sounds sit in the background, under the reading.
  const [volume, setVolumeState] = useState(() => { try { const v = Number(localStorage.getItem(VOLUME_KEY)); return localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME; } catch { return DEFAULT_VOLUME; } });
  useEffect(() => { ambience.setVolume(volume); }, [ambience, volume]);
  const setVolume = useCallback((v: number) => { setVolumeState(v); try { localStorage.setItem(VOLUME_KEY, String(v)); } catch { /* not saved: fine */ } }, []);
  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    if (next) void ambience.enable(); else ambience.disable();
    try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* not saved: fine */ }
  }, [soundOn, ambience]);
  useEffect(() => {
    // Sound was on last time: browsers only allow it to start after a click or key press, so wait for the first one.
    let saved = false;
    try { saved = localStorage.getItem(SOUND_KEY) === '1'; } catch { /* no storage */ }
    if (!saved) return;
    const start = () => { setSoundOn(true); void ambience.enable(); };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => { window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
  }, [ambience]);
  useEffect(() => {
    const onVisible = () => ambience.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); ambience.disable(); };
  }, [ambience]);
  // ── the Sirah in one minute (SummaryFilm) ──
  const [filmOpen, setFilmOpen] = useState(false);
  const [filmEvent, setFilmEvent] = useState<number | null>(null);
  const openFilm = useCallback(() => { setPlaying(false); setFilmOpen(true); }, []);
  const closeFilm = useCallback(() => setFilmOpen(false), []);
  const eventSound = filmEvent !== null ? data.sounds.get(filmEvent) : step.kind === 'event' ? data.sounds.get(events[step.index].n) : undefined;
  const scene: Scene = eventSound?.kind ?? 'calm', horses = !!eventSound?.horses;
  useEffect(() => { ambience.setScene(scene, horses); }, [ambience, scene, horses, active, filmEvent]);

  useEffect(() => {
    if (!playing) return;
    if (active >= steps.length - 1) { setPlaying(false); return; }
    if (step.kind === 'quiz' && !progress.answers[questionOf(step.period, progress.answers).q.id]) { setPlaying(false); return; } // wait for an answer
    const id = window.setTimeout(() => goToStep(active + 1), stepMs);
    return () => window.clearTimeout(id);
  }, [playing, active, steps.length, step, progress.answers, goToStep, questionOf, stepMs]);

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
  const [place, setPlace] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const peopleApi = useMemo(() => ({ data, open: setPerson, openPlace: setPlace }), [data]);
  // "/" or Ctrl/⌘+K opens search, unless the reader is typing somewhere.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const typing = (ev.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]');
      if ((ev.key === '/' && !typing) || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')) { ev.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const unplaced = useMemo(() => unplacedVerses(data), [data]);
  // Timeline marks for events the sources tie verses to (the same links the event card lists under "Verses linked to this event").
  const revealed = useMemo(() => {
    const out = new Map<number, 'direct' | 'suggested'>();
    for (const e of events) {
      const { direct } = versesFor(data, e);
      if (direct.some(v => v.link?.type === 'direct' || v.link?.type === 'after')) out.set(e.n, 'direct');
      else if (direct.length) out.set(e.n, 'suggested');
    }
    return out;
  }, [data, events]);
  const [undatedOpen, setUndatedOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ask, setAsk] = useState<{ text: string; key: number } | null>(null);
  const closeAsk = useCallback(() => setAskOpen(false), []);
  // Phones: once an answer has moved the map, the Ask sheet sits beneath the map so the place stays in view. Opening or
  // closing the sheet starts it afresh, full height.
  const [besideMap, setBesideMap] = useState(false);
  useEffect(() => setBesideMap(false), [askOpen]);
  // How much of the map the sheet still covers there: a strip at the bottom where it cannot fit wholly beneath the
  // map, or one side where it stands beside it (a phone on its side). The map keeps the place in the rest.
  const [sheetCover, setSheetCover] = useState({ bottom: 0, side: 0 });
  useLayoutEffect(() => {
    const panel = document.getElementById('ask-panel'), map = column.current?.parentElement?.querySelector('.hmap-frame');
    const none = { bottom: 0, side: 0 };
    if (wide || !besideMap || !panel || !map) { setSheetCover(none); return; }
    const measure = () => {
      const p = panel.getBoundingClientRect(), m = map.getBoundingClientRect();
      if (p.height === 0 || p.top >= m.bottom) { setSheetCover(none); return; }
      const beside = p.top <= m.top + 12; // as tall as the map: it stands at the reading-side edge
      setSheetCover(beside ? { bottom: 0, side: Math.round(locale === 'ar' ? m.right - p.left : p.right - m.left) } : { bottom: Math.round(m.bottom - p.top), side: 0 });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(panel);
    return () => ro.disconnect();
  }, [wide, besideMap, locale]);
  const suggest = useCallback((q: string) => setAsk({ text: q, key: Date.now() }), []);
  // The ask bar's suggested question is about the current event, so its answer keeps the reader in place;
  // a typed question moves the story to the event it is about, like any other.
  const stay = useRef(false);
  // On wide screens a question goes straight into a card at the top of the story column (thinking, then the
  // answer), and the current event slides down beneath it — nothing covers the map or the story.
  const [answerCard, setAnswerCard] = useState<{ q: string; a: string | null; key: number; locale: Locale; keepPlace: boolean; metadata?: Answer | null } | null>(null);
  const [replyMeta, setReplyMeta] = useState<Answer | null>(null);
  const mapEvents = useMemo(() => new Set(events.filter(e => e.lat !== null && e.lon !== null).map(e => e.n)), [events]);
  const { chats, remember, clear: clearChats, remove: deleteChat } = useChatHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatSequence = useRef(Math.max(Date.now(), ...chats.map(chat => chat.id)));
  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const [returnTo, setReturnTo] = useState<{ step: number; label: string } | null>(null);
  const stepLabel = useCallback((i: number) => {
    const s = steps[i];
    if (s.kind === 'event') return events[s.index].title[locale] || events[s.index].title.ar;
    if (s.kind === 'chapter') return periodName[locale][s.period];
    if (s.kind === 'quiz') return text.quizKicker(s.chapter);
    return text.summaryKicker;
  }, [steps, events, locale, text]);
  const goBack = useCallback(() => { if (returnTo) goToStep(returnTo.step); setReturnTo(null); }, [returnTo, goToStep]);
  // A jump from the map, a card or search remembers where the reader was, so the map can offer the way back.
  const jumpTo = useCallback((n: number) => {
    const from = activeRef.current, i = events.findIndex(e => e.n === n), there = i >= 0 ? stepOfEvent.get(i) : undefined;
    if (there !== undefined && there !== from) setReturnTo({ step: from, label: stepLabel(from) });
    goToEvent(n);
  }, [events, stepOfEvent, stepLabel, goToEvent]);
  timelineJump.current = (from, to) => {
    let between = 0;
    for (let s = Math.min(from, to) + 1; s < Math.max(from, to); s++) if (steps[s].kind === 'event') between++;
    // Keep the first place left, so browsing several ticks still leads back to where the reader was.
    if (between > 0) setReturnTo(r => r ?? { step: from, label: stepLabel(from) });
  };
  // The back button shows on the map, unless the answer card (wide screens) or the Ask sheet (phones) has its own.
  const showMapBack = !!returnTo && !answerCard && !askOpen;
  // The back button sits just under the period banner, whose height changes with the screen and the text.
  const banner = useRef<HTMLDivElement>(null), mapBack = useRef<HTMLDivElement>(null);
  const [bannerBottom, setBannerBottom] = useState(0), [backH, setBackH] = useState(0);
  useLayoutEffect(() => {
    const el = banner.current, back = mapBack.current;
    if (!el) return;
    const measure = () => { setBannerBottom(el.offsetTop + el.offsetHeight); setBackH(back?.offsetHeight ?? 0); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el); if (back) ro.observe(back);
    return () => ro.disconnect();
  }, [built, showMapBack]);
  // What covers the top of the map, kept clear when it moves to a place: the period banner, and the back button under it.
  const topCover = showMapBack && backH ? bannerBottom + 8 + backH : bannerBottom;
  // Back where they started (by the button or by scrolling): the way back is no longer needed. Only once they have
  // left it, though: an answer offers the way back a moment before it moves the story, and that moment is no return.
  const leftReturn = useRef(false);
  useEffect(() => {
    if (!returnTo) { leftReturn.current = false; return; }
    if (active !== returnTo.step) leftReturn.current = true;
    else if (leftReturn.current) { leftReturn.current = false; setReturnTo(null); }
  }, [active, returnTo]);
  // Opening a search result: an event or a verse goes to its place in the story, a person or place opens its card.
  const openResult = useCallback((r: SearchResult) => {
    if (r.kind === 'event') jumpTo(Number(r.id));
    else if (r.kind === 'person') { const p = data.people.find(x => x.id === r.id); if (p) setPerson(p); }
    else if (r.kind === 'place') setPlace(r.id);
    else {
      const v = data.verses.find(x => x.id === r.id), e = v && verseEvent(data, v);
      if (e) jumpTo(e.n); else setUndatedOpen(true);
    }
  }, [data, jumpTo]);
  useLayoutEffect(() => {
    // Push the open event card below the answer card (a visual shift only, so scroll tracking is unaffected).
    const page = column.current?.closest<HTMLElement>('.journey-page');
    if (!page) return;
    const card = document.querySelector<HTMLElement>('.answer-card');
    if (!answerCard || !card) { page.style.setProperty('--answer-push', '0px'); return; }
    const measure = () => {
      const target = column.current?.querySelector<HTMLElement>('.step.is-on > :first-child');
      if (!target) return;
      // Where the card would sit unshifted: its box minus the shift it has right now (mid-slide included).
      const shifted = parseFloat(getComputedStyle(target).translate.split(' ')[1] ?? '0') || 0;
      const natural = target.getBoundingClientRect().top - shifted;
      // The card's laid-out bottom (its fold-in animation scales it, so its box is not used while that runs).
      const holder = (card.offsetParent as HTMLElement | null)?.getBoundingClientRect().top ?? 0;
      const below = holder + card.offsetTop + card.offsetHeight + 16;
      // Only nudge a card that is actually on screen under the answer; one elsewhere (e.g. mid-jump) is left alone.
      const push = natural >= 0 && natural < below ? below - natural : 0;
      page.style.setProperty('--answer-push', `${Math.round(push)}px`);
    };
    measure();
    const frame = requestAnimationFrame(measure); // the newly opened card renders just after this
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    // After a jump or a scroll, settle against the new position ('story-settled' comes from the chapter dash).
    window.addEventListener('scrollend', measure);
    window.addEventListener('story-settled', measure);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener('scrollend', measure); window.removeEventListener('story-settled', measure); };
  }, [answerCard, active]);
  // One suggested question for where the reader is, worked out at idle time and shown in the ask bar.
  const [askHint, setAskHint] = useState<string | null>(null);
  useEffect(() => {
    setAskHint(null);
    if (step.kind !== 'event' || intro) return;
    return onIdle(() => setAskHint(suggestFor(data, current, locale, 1)[0] ?? null), 1500);
  }, [step.kind, current, data, locale, intro]);
  const onAsk = useCallback((question: string, acceptMetadata?: (metadata: Answer | null) => void): string | Promise<string> => {
    const record = (reply: string, metadata?: Answer) => {
      if (acceptMetadata) acceptMetadata(metadata ?? null); else setReplyMeta(metadata ?? null);
      remember({ id: ++chatSequence.current, question, answer: reply, locale, createdAt: Date.now(), sources: metadata?.sources, event: metadata?.event });
      return reply;
    };
    if (QUIZ_ASK.test(question)) {
      // "Quiz me": a question on the map from where the reader is, or say plainly that none is left here.
      const next = pickQuick();
      setWalk(null);
      setQuick(next);
      if (next.q) window.setTimeout(() => setAskOpen(false), 1600);
      return record(next.q ? text.quizFromAsk : next.empty === 'later' ? text.quizLater : text.quizNoneLeft);
    }
    const keep = stay.current;
    stay.current = false;
    setBesideMap(false);
    // The RAG backend first; the in-browser answer when it is off or unreachable.
    return askServer(question, locale).then(fromServer => {
      const reply = fromServer ?? answer(data, question, locale);
      // The event the answer is about, even when the backend named none (see answerEvent).
      const event = answerEvent(data, question, reply, locale);
      const result: Answer = { ...reply, event };
      if (event !== undefined && !keep) window.setTimeout(() => {
        // Remember where the reader was, so they can come back after the answer has taken them elsewhere.
        const from = activeRef.current, there = stepOfEvent.get(events.findIndex(e => e.n === event));
        if (there !== undefined && there !== from) setReturnTo(r => r ?? { step: from, label: stepLabel(from) });
        if (!wide) setBesideMap(true);
        goToEvent(event);
      }, 400);
      return record(result.text, result);
    });
  }, [data, locale, goToEvent, pickQuick, text, events, stepOfEvent, stepLabel, remember, wide]);

  const showAnswerEvent = (n: number) => {
    if (!mapEvents.has(n)) return;
    const from = activeRef.current;
    setReturnTo(r => r ?? { step: from, label: stepLabel(from) });
    setHistoryOpen(false); setAskOpen(false); goToEvent(n);
  };
  const answerActions = <AnswerActions sources={replyMeta?.sources} event={replyMeta?.event !== undefined && mapEvents.has(replyMeta.event) ? replyMeta.event : undefined} locale={locale} onEvent={showAnswerEvent} />;
  const focusAskBar = () => document.querySelector<HTMLInputElement>('.ask-bar input')?.focus();
  const askAbout = useCallback((question?: string, keepPlace = false) => {
    setQuick(null);
    if (!wide) { setAskOpen(true); if (question) { stay.current = keepPlace; suggest(question); } return; }
    if (!question) return;
    setAnswerCard({ q: question, a: null, key: ++chatSequence.current, locale, keepPlace });
  }, [wide, suggest, locale]);

  const begin = () => {
    try { sessionStorage.setItem('bidaya.intro.seen', '1'); } catch { /* storage unavailable */ }
    setBuilt(true);
    setIntro(false);
    window.requestAnimationFrame(() => goToStep(0));
  };

  const startOver = () => {
    setProgress(freshProgress()); setQuizAt({}); setPlaying(false); setReturnTo(null); setResume(false); begin();
  };
  const resetNote = locale === 'ar' ? 'البدء من جديد يمسح نتائج الاختبارات والأحداث التي زرتها وموضع القراءة. تبقى محادثاتك محفوظة.' : 'Starting over clears quiz results, visited events, and your reading position. Your chats stay saved.';

  const answered = [...pools.values()].flat().filter(q => progress.answers[q.id]);
  const correct = answered.filter(q => progress.answers[q.id] === q.answer).length;
  const placesSeen = new Set(progress.seen.map(n => data.byNumber.get(n)?.place).filter(Boolean)).size;

  return <PeopleProvider value={peopleApi}>
    {resume && <ResumeDialog locale={locale} note={resetNote} onContinue={() => { const n = progress.lastEvent!; setResume(false); setIntro(false); setBuilt(true); goToEvent(n, false); }} onRestart={startOver} />}
    {intro && <Intro locale={locale} reducedMotion={reducedMotion} onBegin={begin} onSkip={() => { try { sessionStorage.setItem('bidaya.intro.seen', '1'); } catch { /* storage unavailable */ } setBuilt(true); setIntro(false); }} />}
    <nav className="story-toolbar" aria-label={text.toolbar}>
      <ol className="tb-chapters" aria-label={text.chapters}>
        {steps.flatMap((s, i) => s.kind === 'chapter' ? [<li key={s.period}>
          <button type="button" className={`tb-chapter${chapter === s.chapter && step.kind !== 'summary' ? ' is-now' : ''}${(pools.get(s.period) ?? []).some(q => progress.answers[q.id]) ? ' is-done' : ''}`} aria-current={chapter === s.chapter && step.kind !== 'summary' ? 'step' : undefined}
            title={`${text.chapter(s.chapter)} · ${periodName[locale][s.period]}`} onClick={() => { setPlaying(false); goToStep(i); }}>
            <b>{digits(s.chapter, locale)}</b><span>{periodName[locale][s.period]}</span>
          </button>
        </li>] : [])}
      </ol>
      <div className="tb-end">
        <button type="button" className="tb-btn tb-film" aria-haspopup="dialog" title={text.filmHint} onClick={openFilm}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8.3 6.8v6.4l5-3.2z" fill="currentColor" /></svg>
          <span className="tb-long">{text.film}</span>
        </button>
        <SoundMenu locale={locale} on={soundOn} volume={volume} onToggle={toggleSound} onVolume={setVolume} />
        <button type="button" className="tb-btn tb-search" aria-haspopup="dialog" aria-label={text.searchTitle} title={`${text.searchTitle} ( / )`} onClick={() => setSearchOpen(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span className="tb-long">{text.search}</span>
        </button>
        <button type="button" className={`tb-btn tb-quiz${quick ? ' is-open' : ''}`} aria-pressed={!!quick} aria-label={text.quizMe} onClick={() => (quick ? setQuick(null) : openQuick())}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7.8 8a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="10" cy="14.3" r=".9" fill="currentColor" /></svg>
          <span className="tb-long">{text.quizMe}</span>
        </button>
        {/* Wide screens ask from the bar on the map; phones (no bar) keep this button. */}
        {!wide && <button type="button" className={`tb-btn tb-ask${askOpen ? ' is-open' : ''}`} aria-expanded={askOpen} aria-controls="ask-panel" onClick={() => setAskOpen(o => !o)}>
          <AskIcon />
          <span className="tb-long">{text.ask}</span><span className="tb-short">{text.askShort}</span>
        </button>}
      </div>
      <AskPanel open={askOpen} besideMap={besideMap} onClose={closeAsk} locale={locale} reducedMotion={reducedMotion} onAsk={onAsk} ask={ask} onSuggest={suggest} back={returnTo} onBack={goBack} onHistory={openHistory} answerActions={answerActions} />
      {answerCard && <AnswerCard key={answerCard.key} card={answerCard} locale={locale} back={returnTo} onBack={goBack}
        reducedMotion={reducedMotion} answerActions={<AnswerActions sources={answerCard.metadata?.sources} event={answerCard.metadata?.event !== undefined && mapEvents.has(answerCard.metadata.event) ? answerCard.metadata.event : undefined} locale={locale} onEvent={showAnswerEvent}
          extra={returnTo ? <BackButton label={returnTo.label} locale={locale} onClick={goBack} /> : undefined} />} onAnswer={question => {
          stay.current = answerCard.keepPlace;
          return Promise.resolve(onAsk(question, metadata => setAnswerCard(card => card?.key === answerCard.key ? { ...card, metadata } : card)))
            .then(reply => { setAnswerCard(card => card?.key === answerCard.key ? { ...card, a: reply } : card); return reply; });
        }}
        onClose={() => setAnswerCard(null)} onAgain={() => { setAnswerCard(null); focusAskBar(); }} />}
    </nav>
    {built && <div className="scrolly">
      <div className="scrolly-steps" ref={column}>
        <HoldStill store={stepStore} anchor={anchor} column={column} lockUntil={lockUntil} glide={wide && !reducedMotion} />
        <StepList steps={steps} data={data} locale={locale} store={stepStore} goToStep={goToStep} goToEvent={goToEvent} onWalk={startWalk} answers={progress.answers} onAnswer={answerQuiz} questionOf={questionOf} nextQuestion={nextQuestion} onMore={moreQuiz} keepOpen={!wide} playing={playing} />
        <section data-step={steps.length - 1} className={`step step-summary${step.kind === 'summary' ? ' is-on' : ''}`}>
          <span>{text.summaryKicker}</span>
          <h2>{text.summaryTitle}</h2>
          <dl className="summary-stats">
            <div><dt>{text.statEvents}</dt><dd>{digits(progress.seen.length, locale)} / {digits(events.length, locale)}</dd></div>
            <div><dt>{text.statPlaces}</dt><dd>{digits(placesSeen, locale)}</dd></div>
            <div><dt>{text.statQuiz}</dt><dd>{digits(correct, locale)} / {digits(answered.length, locale)}</dd></div>
            <div><dt>{text.statReached}</dt><dd>{digits(reached, locale)}</dd></div>
          </dl>
          <p>{resetNote}</p>
          <div className="summary-actions">
            <button type="button" className="btn-primary" onClick={openFilm}>{text.film}</button>
            <button type="button" className="btn-quiet" onClick={startOver}>{text.restart}</button>
            <button type="button" className="btn-quiet" onClick={() => (wide ? focusAskBar() : setAskOpen(true))}>{text.ask}</button>
          </div>
        </section>
      </div>

      <div className={`scrolly-map${sheetCover.side ? ' has-side-sheet' : ''}`} style={sheetCover.side ? { '--sheet-side': `${sheetCover.side}px` } as React.CSSProperties : undefined}>
        <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={step.kind === 'event' ? current.n : null} activeRoutes={activeRoutes}
          onSelect={jumpTo} reducedMotion={reducedMotion} inset={(quick || walk) && wide ? 430 : sheetCover.side} insetTop={topCover} insetBottom={Math.max(timelineH + (wide ? 76 : walk ? walkPanelH + 8 : 0), sheetCover.bottom)} focusKey={`${active}-${walk?.stop ?? ''}`} now={now} legend={false}
          overview={step.kind === 'summary' || step.kind === 'chapter' && step.chapter === 1}
          caravans={current.period === 'prologue' || current.period === 'makkah'} scrollPage
          walk={walk && walkStop ? { routeId: walk.route.id, lat: walkStop.lat, lon: walkStop.lon, key: `${walk.route.id}-${walk.stop}`, name: walkStop.name[locale] } : null}
          quiz={quick?.q ? { options: quick.q.options, answer: quick.q.answer, chosen: progress.answers[quick.q.id] ?? null, onPick: k => answerQuick(quick.q!, k) }
            : quizNow ? { options: quizNow.options, answer: quizNow.answer, chosen: progress.answers[quizNow.id] ?? null, onPick: k => answerQuiz(quizNow, k) } : null}>
          <div className="story-banner" ref={banner} data-map-overlay aria-hidden="true">
            {step.kind === 'summary' ? <b>{text.summaryKicker}</b> : <><b>{periodName[locale][current.period]}</b><span>{hijri(current.year, locale)}</span></>}
            {reached > 0 && <span className="story-reach"><i /><span>{text.reachedCount(reached)}<small>{text.reachedNote}</small></span></span>}
          </div>
          {/* After a jump from the map, a card, search or an answer: one tap back to where the reader was (inside the
              answer card while that is open). */}
          {showMapBack && <div className="map-back" ref={mapBack} style={bannerBottom ? { top: bannerBottom + 8 } : undefined} data-map-overlay><BackButton label={returnTo.label} locale={locale} onClick={goBack} /></div>}


          {wide && !quick && !walk && <AskBar locale={locale} hint={askHint} onAsk={askAbout} onHistory={openHistory} />}

          {quick && wide && <QuickQuiz quick={quick} data={data} locale={locale} chosen={quick.q ? progress.answers[quick.q.id] ?? null : null}
            onAnswer={answerQuick} onNext={() => setQuick(pickQuick(quick.q?.id))} onClose={() => setQuick(null)} />}

          {walk && walkStop && <div className="walk-panel" ref={walkPanel} data-map-overlay role="group" aria-label={walk.route.name[locale]}>
            <p className="walk-kicker">{walk.route.name[locale]} · {text.stopOf(walk.stop + 1, walkStops.length)}</p>
            {(() => { // How far along the (approximate) route this stop is.
              const c = walk.route.coords, near = c.reduce((b, p, i) => ((p[0] - walkStop.lon) ** 2 + (p[1] - walkStop.lat) ** 2 < (c[b][0] - walkStop.lon) ** 2 + (c[b][1] - walkStop.lat) ** 2 ? i : b), 0);
              const fmt = (d: number) => digits(roundKm(d).toLocaleString('en'), locale);
              return <p className="walk-distance">{text.distanceSoFar(fmt(pathKm(c, near)), fmt(pathKm(c)))}</p>;
            })()}
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

          <div className="story-timeline" data-map-overlay ref={timelineBox}>
            <Timeline events={events} index={index} store={eventStore} locale={locale} playing={playing} reducedMotion={reducedMotion}
              onIndex={onTimelineIndex} onStep={stepEvent} onTogglePlay={() => setPlaying(p => !p)} revealed={revealed}
              story={{ ms: stepMs, step: active, pace, onPace: setPace }}
              extra={unplaced.length > 0 && <button type="button" className="tl-btn tl-undated" aria-haspopup="dialog" onClick={() => setUndatedOpen(true)}>{text.undated(unplaced.length)}</button>} />
          </div>
        </HistoricMap>
      </div>
    </div>}
    {quick && !wide && <QuickQuiz quick={quick} data={data} locale={locale} chosen={quick.q ? progress.answers[quick.q.id] ?? null : null}
      onAnswer={answerQuick} onNext={() => setQuick(pickQuick(quick.q?.id))} onClose={() => setQuick(null)} />}
    {undatedOpen && <UndatedDialog verses={unplaced} locale={locale} onClose={() => setUndatedOpen(false)} />}
    {filmOpen && <SummaryFilm data={data} locale={locale} reducedMotion={reducedMotion} onClose={closeFilm} onBeat={setFilmEvent}
      onJump={n => { setFilmOpen(false); jumpTo(n); }} />}
    {person && <PersonDialog key={person.id} person={person} data={data} locale={locale} onClose={() => setPerson(null)} onEvent={jumpTo} />}
    {place && <PlaceCard key={place} placeKey={place} data={data} locale={locale} onClose={() => setPlace(null)} onEvent={jumpTo} />}
    {searchOpen && <Search data={data} locale={locale} onClose={() => setSearchOpen(false)} onPick={openResult} />}
    {historyOpen && <ChatHistory locale={locale} chats={chats} onDelete={deleteChat} mapEvents={mapEvents} onEvent={showAnswerEvent} onClear={clearChats} onClose={() => setHistoryOpen(false)} />}
  </PeopleProvider>;
}

/**
 * When scrolling opens one card and closes the one above it, the page would shift by the difference and the
 * reading line would land a step or two further on. This runs after those cards re-render and scrolls by the
 * shift, so the step the reader reached stays exactly where it was.
 */
function HoldStill({ store, anchor, column, lockUntil, glide }: { store: ActiveStore; anchor: React.RefObject<{ step: number; top: number } | null>; column: React.RefObject<HTMLDivElement | null>; lockUntil: React.RefObject<number>; glide: boolean }) {
  const active = useActive(store, a => a);
  const last = useRef(active);
  useLayoutEffect(() => {
    const held = anchor.current, down = active > last.current;
    last.current = active;
    anchor.current = null;
    if (!held || held.step !== active) return;
    const el = column.current?.querySelector<HTMLElement>(`[data-step="${active}"]`);
    const shift = el ? el.getBoundingClientRect().top - held.top : 0;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
    if (!el || !down || !glide) return;
    // Scrolling down opens the next card at the reading line, mostly below the screen. Once the reader pauses,
    // bring it up to the middle (or to the top, when it is taller than the screen).
    let timer = 0;
    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        cleanup();
        if (performance.now() < lockUntil.current || !el.classList.contains('is-on')) return;
        const box = el.getBoundingClientRect(), margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        const want = Math.max(margin, (window.innerHeight - box.height) / 2), by = box.top - want;
        if (by < 24) return;
        lockUntil.current = performance.now() + 1200;
        window.addEventListener('scrollend', () => { lockUntil.current = performance.now() + 50; }, { once: true });
        window.scrollBy({ top: by, behavior: 'smooth' });
      }, 160);
    };
    const cleanup = () => { window.clearTimeout(timer); window.removeEventListener('scroll', settle); };
    window.addEventListener('scroll', settle, { passive: true });
    settle();
    return cleanup;
  }, [active, anchor, column, lockUntil, glide]);
  return null;
}

/** All steps but the summary; memoised so it re-renders only when the steps, the language or an answer change. */
const StepList = memo(function StepList({ steps, data, locale, store, goToStep, goToEvent, onWalk, answers, onAnswer, questionOf, nextQuestion, onMore, keepOpen, playing }: {
  keepOpen: boolean; playing: boolean; steps: Step[]; data: Sirah; locale: Locale; store: ActiveStore; goToStep: (i: number) => void; goToEvent: (n: number) => void;
  onWalk: (route: Route) => void; answers: Record<string, string>; onAnswer: (q: QuizQuestion, key: string) => void;
  questionOf: (period: Period, answers: Record<string, string>) => { q: QuizQuestion; at: number; total: number };
  nextQuestion: (period: Period) => number; onMore: (period: Period) => void;
}) {
  return <>{steps.map((s, i) => {
    if (s.kind === 'chapter') return <ChapterStep key={`c${s.chapter}`} s={s} i={i} store={store} events={data.events} locale={locale} />;
    if (s.kind === 'event') return <EventStep key={data.events[s.index].n} index={s.index} i={i} store={store} data={data} locale={locale} goToStep={goToStep} goToEvent={goToEvent} onWalk={onWalk} keepOpen={keepOpen} playing={playing} />;
    if (s.kind === 'quiz') {
      const { q, at, total } = questionOf(s.period, answers);
      return <QuizCard key={`q${s.chapter}`} step={i} store={store} q={q} at={at} total={total} hasMore={nextQuestion(s.period) >= 0} chapter={s.chapter} data={data} locale={locale} chosen={answers[q.id] ?? null} onAnswer={onAnswer} onMore={onMore} goToStep={goToStep} />;
    }
    return null;
  })}</>;
});

/** The "Ask the map" panel; memoised so moving through the story leaves the orb untouched. */
const AskPanel = memo(function AskPanel({ open, besideMap, onClose, locale, reducedMotion, onAsk, ask, onSuggest, back, onBack, onHistory, answerActions }: {
  open: boolean; besideMap: boolean; onClose: () => void; locale: Locale; reducedMotion: boolean; onAsk: (q: string) => string | Promise<string>; ask: { text: string; key: number } | null; onSuggest: (q: string) => void;
  back: { label: string } | null; onBack: () => void;
  onHistory: () => void; answerActions: React.ReactNode;
}) {
  const text = journeyCopy[locale];
  // The orb is made the first time the panel opens, then kept (with its answer). Made at load, hidden, it laid out
  // the whole page in the middle of the Journey's first render: the longest pause before the page answers a tap.
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);
  return <section id="ask-panel" className={`ask-panel${open ? ' is-open' : ''}${besideMap ? ' is-beside-map' : ''}`} aria-label={text.ask} inert={!open}>
    <div className="ask-head"><h2>{text.ask}</h2><button type="button" className="qr-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button></div>
    {used && <MorphOrb locale={locale} reducedMotion={reducedMotion} onSubmit={onAsk} minThinkMs={900} ask={ask} onHistory={onHistory} historyLabel={chatCopy[locale].title} answerActions={answerActions} />}
    {back && <BackButton label={back.label} locale={locale} onClick={() => { onBack(); onClose(); }} />}
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

const EventStep = memo(function EventStep({ index, i, store, data, locale, goToStep, goToEvent, onWalk, keepOpen, playing }: {
  index: number; i: number; store: ActiveStore; data: Sirah; locale: Locale; goToStep: (i: number) => void; goToEvent: (n: number) => void; onWalk: (route: Route) => void;
  /** Narrow screens: a card stays open once read, so nothing above the reader folds shut and moves the page mid-scroll. */
  keepOpen: boolean;
  /** Story mode is playing: the open card shows its whole text. */
  playing: boolean;
}) {
  const on = useActive(store, a => a === i);
  const [read, setRead] = useState(false);
  if (on && !read) setRead(true);
  const open = on || (keepOpen && read);
  const e = data.events[index];
  const route = on ? data.routes.find(r => r.kind === 'sirah' && r.events.includes(e.n) && (data.stops.get(r.id)?.length ?? 0) > 1 && data.stops.get(r.id)!.some(st => st.event === e.n)) ?? null : null;
  // A walk needs at least two stops, and is offered on the event its stops quote (not on a later event that shares the line).
  return <section data-step={i} className={`step step-event${on ? ' is-on' : ''}${open && !on ? ' is-read' : ''}`} onClick={() => !on && goToStep(i)}>
    {open ? <EventCard data={data} event={e} locale={locale} chapter={PERIOD_ORDER.indexOf(e.period) + 1}
      yearEvents={data.events.filter(x => x.year === e.year && x.period === e.period)} onPick={goToEvent}
      onWalk={route ? () => onWalk(route) : undefined} walkName={route?.name[locale]} full={on && playing} current={on} />
      : <div className="step-peek"><p className="step-date">{hijri(e.year, locale)} · {eventPlaceName(data, e, locale)}</p><h3>{e.title[locale] || e.title.ar}</h3></div>}
  </section>;
});

/** An answer folded out of the Ask panel: the question, the sourced answer, and a way to ask again. */
/** Takes the reader back to where they were before an answer moved the story. */
function BackButton({ label, locale, onClick }: { label: string; locale: Locale; onClick: () => void }) {
  const text = journeyCopy[locale];
  return <button type="button" className="back-btn" onClick={onClick}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={locale === 'ar' ? 'M8 5 4 9l4 4M4 9h7a5 5 0 0 1 0 10H9' : 'M12 5l4 4-4 4M16 9H9a5 5 0 0 0 0 10h2'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>{text.backTo}</span><b>«{label}»</b>
  </button>;
}

function AnswerCard({ card, locale, reducedMotion, onAnswer, onClose, onAgain, back, onBack, answerActions }: { answerActions: React.ReactNode; card: { q: string; a: string | null; key: number; locale: Locale }; locale: Locale; reducedMotion: boolean; onAnswer: (question: string) => string | Promise<string>; onClose: () => void; onAgain: () => void; back: { label: string } | null; onBack: () => void }) {
  const text = journeyCopy[locale];
  const respond = useRef(onAnswer);
  const [revealed, setRevealed] = useState(false);
  return <section className="answer-card" aria-label={text.ask}>
    <p className="answer-kicker"><AskIcon />{text.yourQuestion}</p>
    <h3 lang={card.locale} dir="auto">{card.q}</h3>
    <MorphOrb docked request={{ id: card.key, text: card.q }} locale={locale} answerLocale={card.locale}
      reducedMotion={reducedMotion} onSubmit={respond.current} minThinkMs={900} onAnswered={() => setRevealed(true)} onCancel={onClose} answerActions={answerActions} />
    {/* "Ask another" sits in the header beside the close button, so the card ends where the answer ends. */}
    {revealed && <button type="button" className="answer-again" onClick={onAgain}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8A6 6 0 1 0 16 11M15.5 3.5V8H11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{text.askAgain}
    </button>}
    <button type="button" className="walk-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
  </section>;
}

/** Always on the map: type a question, or press Enter to ask the suggested one. */
function AskBar({ locale, hint, onAsk, onHistory }: { locale: Locale; hint: string | null; onAsk: (question?: string, keepPlace?: boolean) => void; onHistory: () => void }) {
  const text = journeyCopy[locale];
  const [q, setQ] = useState('');
  return <form className="ask-bar" data-map-overlay role="search" aria-label={text.ask} onSubmit={e => { e.preventDefault(); const typed = q.trim(); onAsk(typed || hint || undefined, !typed); setQ(''); }}>
    <button type="button" className="ask-bar-history" data-tooltip={chatCopy[locale].title} onClick={onHistory} aria-label={chatCopy[locale].title} aria-haspopup="dialog"><AskIcon className="ask-bar-spark" /></button>
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

function ResumeDialog({ locale, note, onContinue, onRestart }: { locale: Locale; note: string; onContinue: () => void; onRestart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="chat-history resume-dialog" aria-labelledby="resume-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} onCancel={event => { event.preventDefault(); onContinue(); }}>
    <h2 id="resume-title">{locale === 'ar' ? 'تابع من حيث توقفت' : 'Continue where you left off'}</h2>
    <div className="resume-actions"><button className="btn-primary" autoFocus onClick={onContinue}>{locale === 'ar' ? 'متابعة القراءة' : 'Continue reading'}</button><button className="btn-quiet" onClick={onRestart}>{locale === 'ar' ? 'البدء من جديد' : 'Start over'}</button></div>
    <p>{note}</p>
  </dialog>;
}

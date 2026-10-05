import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { hijri, periodName, PERIOD_ORDER } from '../data/select';
import type { SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';
import { useActive, type ActiveStore } from './activeStore';

interface Props {
  events: SirahEvent[];
  index: number;
  /** The same index as a store, so the ticks update without the whole list re-rendering. */
  store: ActiveStore;
  locale: Locale;
  playing: boolean;
  reducedMotion: boolean;
  onIndex: (i: number) => void;
  /** Previous / next arrows; when given, they step through the story rather than by event index. */
  onStep?: (dir: 1 | -1) => void;
  onTogglePlay: () => void;
  /** Extra control shown at the end of the bar. */
  extra?: React.ReactNode;
  /** Events the sources tie verses to: 'direct' when a hadith names the event, 'suggested' for a proposed place. */
  revealed?: Map<number, 'direct' | 'suggested'>;
}

export default function Timeline({ events, index, store, locale, playing, reducedMotion, onIndex, onStep, onTogglePlay, extra, revealed }: Props) {
  const text = journeyCopy[locale];
  const track = useRef<HTMLDivElement>(null);
  const current = events[index];

  useEffect(() => {
    // Centre the current tick by scrolling the timeline sideways only (scrollIntoView would also scroll the page).
    const scroller = track.current, el = scroller?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    if (!scroller || !el) return;
    const a = el.getBoundingClientRect(), b = scroller.getBoundingClientRect();
    scroller.scrollBy?.({ left: a.left + a.width / 2 - (b.left + b.width / 2), behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [index, reducedMotion]);

  const onKey = (ev: KeyboardEvent) => {
    const rtl = locale === 'ar';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -Infinity, End: Infinity }[ev.key];
    if (step === undefined) return;
    ev.preventDefault();
    const next = Math.max(0, Math.min(events.length - 1, step === Infinity ? events.length - 1 : step === -Infinity ? 0 : index + step));
    onIndex(next);
    requestAnimationFrame(() => track.current?.querySelector<HTMLElement>(`[data-i="${next}"]`)?.focus({ preventScroll: true }));
  };

  // Year labels where a new year starts, skipping any that would crowd the previous label.
  const yearLabels = useMemo(() => {
    const out = new Set<number>();
    let lastLabel = -Infinity;
    events.forEach((e, i) => {
      if ((i === 0 || events[i - 1].year !== e.year) && i - lastLabel >= 4) { out.add(i); lastLabel = i; }
    });
    return out;
  }, [events]);

  // Period bands: first and last index of each period present.
  const bands = PERIOD_ORDER.map(p => {
    const first = events.findIndex(e => e.period === p);
    if (first < 0) return null;
    let last = first;
    while (last + 1 < events.length && events[last + 1].period === p) last++;
    return { p, first, last };
  }).filter(Boolean) as { p: SirahEvent['period']; first: number; last: number }[];

  return <section className="timeline" aria-label={text.timeline}>
    <div className="tl-bar">
      <div className="tl-buttons">
        <button type="button" className="tl-btn" onClick={() => (onStep ? onStep(-1) : onIndex(Math.max(0, index - 1)))} disabled={index === 0} aria-label={text.prev}><Chevron back /></button>
        <button type="button" className="tl-btn tl-play" onClick={onTogglePlay} aria-pressed={playing} aria-label={playing ? text.pause : text.play}>
          {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          <span>{playing ? text.pause : text.story}</span>
        </button>
        <button type="button" className="tl-btn" onClick={() => (onStep ? onStep(1) : onIndex(Math.min(events.length - 1, index + 1)))} disabled={index === events.length - 1} aria-label={text.next}><Chevron /></button>
      </div>
      <p className="tl-now" aria-live="polite">
        <span className="tl-count">{text.count(index + 1, events.length)}</span>
        <b>{current?.title[locale] || current?.title.ar}</b>
      </p>
      {revealed && revealed.size > 0 && <span className="tl-key" aria-hidden="true"><b className="tl-revealed is-key" />{text.revealedKey}</span>}
      {extra}
    </div>

    <div className="tl-scroll" ref={track} role="listbox" aria-label={text.timeline} aria-activedescendant={`tl-${index}`} onKeyDown={onKey}>
      <div className="tl-track" style={{ ['--n' as string]: events.length }}>
        {bands.map(b => <div key={b.p} className={`tl-band band-${b.p}`} style={{ gridColumn: `${b.first + 1} / ${b.last + 2}` }} title={periodName[locale][b.p]}>{b.last - b.first >= 5 && <span>{periodName[locale][b.p]}</span>}</div>)}
        <Ticks events={events} store={store} yearLabels={yearLabels} locale={locale} onIndex={onIndex} revealed={revealed} />
      </div>
    </div>
    <ScrollRail scroller={track} locale={locale} />
  </section>;
}

function Chevron({ back = false }: { back?: boolean }) {
  // Logical direction: "back" points to the start of the reading direction.
  return <svg viewBox="0 0 20 20" aria-hidden="true" className={back ? 'chev-back' : 'chev-fwd'}><path d="M8 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

const Ticks = memo(function Ticks({ events, store, yearLabels, locale, onIndex, revealed }: { events: SirahEvent[]; store: ActiveStore; yearLabels: Set<number>; locale: Locale; onIndex: (i: number) => void; revealed?: Map<number, 'direct' | 'suggested'> }) {
  return <>{events.map((e, i) => <Tick key={e.n} e={e} i={i} store={store} newYear={i === 0 || events[i - 1].year !== e.year} revealed={revealed?.get(e.n)}
    labelled={(i === 0 || events[i - 1].year !== e.year) && yearLabels.has(i)} locale={locale} onIndex={onIndex} />)}</>;
});

/** One tick; it re-renders only when it becomes, or stops being, current or past. */
const Tick = memo(function Tick({ e, i, store, newYear, labelled, locale, onIndex, revealed }: { e: SirahEvent; i: number; store: ActiveStore; newYear: boolean; labelled: boolean; locale: Locale; onIndex: (i: number) => void; revealed?: 'direct' | 'suggested' }) {
  const text = journeyCopy[locale];
  const state = useActive(store, a => (a === i ? 'on' : a > i ? 'past' : ''));
  const on = state === 'on', past = state === 'past';
  return <button id={`tl-${i}`} data-i={i} type="button" role="option" aria-selected={on} tabIndex={on ? 0 : -1}
    className={`tl-tick${on ? ' is-on' : ''}${past ? ' is-past' : ''}${newYear ? ' new-year' : ''}`}
    style={{ gridColumn: i + 1 }} onClick={() => onIndex(i)} title={`${e.title[locale] || e.title.ar}${revealed ? ` · ${text.revealedMark[revealed]}` : ''}`}>
    {revealed && <b className={`tl-revealed is-${revealed}`} aria-hidden="true" />}
    <i aria-hidden="true" />
    {labelled && e.year !== null && <span className="tl-year" aria-hidden="true">{hijri(e.year, locale)}</span>}
    <span className="tl-sr">{`${e.title[locale] || e.title.ar} — ${hijri(e.year, locale)}${revealed ? ` — ${text.revealedMark[revealed]}` : ''}`}</span>
  </button>;
});

/**
 * The timeline's scrollbar: a slim rail under the ticks with a gold handle for the part in view. Drag the handle,
 * or press anywhere on the rail, to move through the years. Works in both reading directions.
 */
function ScrollRail({ scroller, locale }: { scroller: React.RefObject<HTMLDivElement | null>; locale: Locale }) {
  const [box, setBox] = useState({ at: 0, size: 1 });
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; at: number } | null>(null);
  const rtl = locale === 'ar';
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const measure = () => { frame = 0; const max = el.scrollWidth - el.clientWidth; setBox({ at: max > 0 ? Math.abs(el.scrollLeft) / max : 0, size: Math.min(1, el.clientWidth / el.scrollWidth) }); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll); ro.observe(el);
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [scroller]);
  // Fraction along the rail from its reading start (the right edge in Arabic).
  const scrollTo = (f: number, smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth, x = Math.max(0, Math.min(1, f)) * max;
    el.scrollTo({ left: rtl ? -x : x, behavior: smooth ? 'smooth' : 'instant' });
  };
  const fractionAt = (clientX: number) => {
    const r = rail.current!.getBoundingClientRect(), from = rtl ? r.right - clientX : clientX - r.left;
    return (from / r.width - box.size / 2) / (1 - box.size || 1);
  };
  const onDown = (ev: ReactPointerEvent) => {
    ev.preventDefault();
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    if ((ev.target as Element).classList.contains('tl-rail-thumb')) drag.current = { x: ev.clientX, at: box.at };
    else { drag.current = null; scrollTo(fractionAt(ev.clientX), true); }
  };
  const onMove = (ev: ReactPointerEvent) => {
    const d = drag.current, r = rail.current?.getBoundingClientRect();
    if (!d || !r) return;
    const moved = (ev.clientX - d.x) * (rtl ? -1 : 1) / (r.width * (1 - box.size || 1));
    scrollTo(d.at + moved, false);
  };
  if (box.size >= 0.999) return null;
  return <div className="tl-rail" ref={rail} aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <i className="tl-rail-thumb" style={{ width: `${box.size * 100}%`, insetInlineStart: `${box.at * (1 - box.size) * 100}%` }} />
  </div>;
}

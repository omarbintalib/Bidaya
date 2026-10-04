import { memo, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
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
  onTogglePlay: () => void;
  /** Extra control shown at the end of the bar. */
  extra?: React.ReactNode;
}

export default function Timeline({ events, index, store, locale, playing, reducedMotion, onIndex, onTogglePlay, extra }: Props) {
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
        <button type="button" className="tl-btn" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label={text.prev}><Chevron back /></button>
        <button type="button" className="tl-btn tl-play" onClick={onTogglePlay} aria-pressed={playing} aria-label={playing ? text.pause : text.play}>
          {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          <span>{playing ? text.pause : text.story}</span>
        </button>
        <button type="button" className="tl-btn" onClick={() => onIndex(Math.min(events.length - 1, index + 1))} disabled={index === events.length - 1} aria-label={text.next}><Chevron /></button>
      </div>
      <p className="tl-now" aria-live="polite">
        <span className="tl-count">{text.count(index + 1, events.length)}</span>
        <b>{current?.title[locale] || current?.title.ar}</b>
      </p>
      {extra}
    </div>

    <div className="tl-scroll" ref={track} role="listbox" aria-label={text.timeline} aria-activedescendant={`tl-${index}`} onKeyDown={onKey}>
      <div className="tl-track" style={{ ['--n' as string]: events.length }}>
        {bands.map(b => <div key={b.p} className={`tl-band band-${b.p}`} style={{ gridColumn: `${b.first + 1} / ${b.last + 2}` }} title={periodName[locale][b.p]}>{b.last - b.first >= 5 && <span>{periodName[locale][b.p]}</span>}</div>)}
        <Ticks events={events} store={store} yearLabels={yearLabels} locale={locale} onIndex={onIndex} />
      </div>
    </div>
  </section>;
}

function Chevron({ back = false }: { back?: boolean }) {
  // Logical direction: "back" points to the start of the reading direction.
  return <svg viewBox="0 0 20 20" aria-hidden="true" className={back ? 'chev-back' : 'chev-fwd'}><path d="M8 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

const Ticks = memo(function Ticks({ events, store, yearLabels, locale, onIndex }: { events: SirahEvent[]; store: ActiveStore; yearLabels: Set<number>; locale: Locale; onIndex: (i: number) => void }) {
  return <>{events.map((e, i) => <Tick key={e.n} e={e} i={i} store={store} newYear={i === 0 || events[i - 1].year !== e.year}
    labelled={(i === 0 || events[i - 1].year !== e.year) && yearLabels.has(i)} locale={locale} onIndex={onIndex} />)}</>;
});

/** One tick; it re-renders only when it becomes, or stops being, current or past. */
const Tick = memo(function Tick({ e, i, store, newYear, labelled, locale, onIndex }: { e: SirahEvent; i: number; store: ActiveStore; newYear: boolean; labelled: boolean; locale: Locale; onIndex: (i: number) => void }) {
  const state = useActive(store, a => (a === i ? 'on' : a > i ? 'past' : ''));
  const on = state === 'on', past = state === 'past';
  return <button id={`tl-${i}`} data-i={i} type="button" role="option" aria-selected={on} tabIndex={on ? 0 : -1}
    className={`tl-tick${on ? ' is-on' : ''}${past ? ' is-past' : ''}${newYear ? ' new-year' : ''}`}
    style={{ gridColumn: i + 1 }} onClick={() => onIndex(i)} title={e.title[locale] || e.title.ar}>
    <i aria-hidden="true" />
    {labelled && e.year !== null && <span className="tl-year" aria-hidden="true">{hijri(e.year, locale)}</span>}
    <span className="tl-sr">{`${e.title[locale] || e.title.ar} — ${hijri(e.year, locale)}`}</span>
  </button>;
});

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { digits, hijri, periodName } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { journeyCopy } from './copy';
import EventCard from './EventCard';

/**
 * The whole Sirah, full screen: the map fills the screen and every event is read in turn in a panel beside it, with
 * its full card (text, people, letters, verses, source). The reader steps through with the buttons, the arrow keys or
 * the slider, or lets it play at the story's pace. The browser goes full screen when it can; leaving full screen
 * (Escape) leaves this view too.
 */
export default function SirahScreen({ data, locale, reducedMotion, start, chapterOf, readMs, onClose, onBeat }: {
  data: Sirah; locale: Locale; reducedMotion: boolean;
  /** The event to open on (where the reader is in the story). */
  start: number;
  chapterOf: (e: SirahEvent) => number;
  /** How long an event stays when playing: its text's reading time at the story's pace. */
  readMs: (e: SirahEvent) => number;
  /** Close, handing back the event the reader ended on. */
  onClose: (n: number) => void;
  /** The event on screen (for the background sound), or null when the view closes. */
  onBeat: (n: number | null) => void;
}) {
  const text = journeyCopy[locale];
  const events = data.events;
  const [i, setI] = useState(() => Math.max(0, events.findIndex(e => e.n === start)));
  const [playing, setPlaying] = useState(false);
  const ev = events[i], last = i === events.length - 1;
  const iRef = useRef(i); iRef.current = i;
  // Closing hands back the event on screen and leaves the browser's full screen.
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    onClose(events[iRef.current].n);
  }, [onClose, events]);
  const go = useCallback((to: number) => setI(Math.max(0, Math.min(events.length - 1, to))), [events.length]);

  // Playing moves on once the event's text has had time to be read, and stops at the end.
  useEffect(() => {
    if (!playing) return;
    if (last) { setPlaying(false); return; }
    const id = window.setTimeout(() => setI(x => x + 1), readMs(ev));
    return () => window.clearTimeout(id);
  }, [playing, ev, last, readMs]);
  useEffect(() => { onBeat(ev.n); }, [ev.n, onBeat]);
  useEffect(() => () => onBeat(null), [onBeat]);

  // Each event opens at the top of its card.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { card.current?.scrollTo({ top: 0 }); }, [i]);

  // A dialog over the page: keys step through it, Escape closes it, focus goes back where it was.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLButtonElement>('.fs-next')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('dialog, input, textarea, select')) return; // a person or verse opened over it, or the slider, keep their keys
      const ahead = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight', back = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === ahead) { e.preventDefault(); setPlaying(false); setI(x => Math.min(events.length - 1, x + 1)); }
      else if (e.key === back) { e.preventDefault(); setPlaying(false); setI(x => Math.max(0, x - 1)); }
      else if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; before?.focus?.({ preventScroll: true }); };
  }, [close, locale, events.length]);

  // Leaving the browser's full screen (Escape, or its own control) leaves this view; closing it leaves full screen.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) onClose(events[iRef.current].n); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [onClose, events]);

  // The panel stands at the reading side on wide screens and at the bottom on phones; the map keeps places clear of it.
  const panel = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState({ side: 0, bottom: 0 });
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => {
      const side = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;
      setCover(side ? { side: el.offsetWidth + 32, bottom: 24 } : { side: 0, bottom: el.offsetHeight + 24 });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const emphasis = useCallback((e: SirahEvent): Emphasis => e.n === ev.n ? 'selected' : e.order > ev.order ? 'hidden'
    : e.year === ev.year && e.period === ev.period ? 'active' : 'past', [ev]);
  const activeRoutes = useMemo(() => data.routes.filter(r => r.events.includes(ev.n)).map(r => r.id), [data, ev]);
  const yearEvents = useMemo(() => events.filter(x => x.year === ev.year && x.period === ev.period), [events, ev]);
  const pick = useCallback((n: number) => { setPlaying(false); go(events.findIndex(e => e.n === n)); }, [events, go]);

  return <div className="film fs" ref={root} role="dialog" aria-modal="true" aria-label={text.fullTitle}>
    <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={ev.n} activeRoutes={activeRoutes} onSelect={pick}
      reducedMotion={reducedMotion} focusKey={`fs-${ev.n}`} now={ev.order} legend={false}
      caravans={ev.period === 'prologue' || ev.period === 'makkah'} inset={cover.side} insetTop={96} insetBottom={cover.bottom}>
      <div className="film-top" data-map-overlay>
        <p className="film-kicker">{periodName[locale][ev.period]}</p>
        <p className="film-year" key={ev.year} aria-live="polite">{hijri(ev.year, locale)}</p>
        <button type="button" className="film-close" onClick={close} aria-label={text.close}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>
      <div className="fs-panel" ref={panel} data-map-overlay>
        <div className="fs-card" ref={card} key={ev.n}>
          <EventCard data={data} event={ev} locale={locale} chapter={chapterOf(ev)} yearEvents={yearEvents} onPick={pick} full current />
        </div>
        <div className="fs-controls">
          <button type="button" className="fs-step" onClick={() => { setPlaying(false); go(i - 1); }} disabled={i === 0} aria-label={text.prev}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="film-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? text.pause : text.play} disabled={last && !playing}>
            {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <button type="button" className="fs-step fs-next" onClick={() => { setPlaying(false); go(i + 1); }} disabled={last} aria-label={text.next}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <label className="fs-scrub">
            <span className="sr-only">{text.fullScrub}</span>
            <input type="range" min={0} max={events.length - 1} value={i} dir={locale === 'ar' ? 'rtl' : 'ltr'}
              aria-valuetext={`${digits(i + 1, locale)} / ${digits(events.length, locale)} · ${ev.title[locale] || ev.title.ar}`}
              onChange={e => { setPlaying(false); go(Number(e.target.value)); }} />
          </label>
          <span className="fs-count">{digits(i + 1, locale)} / {digits(events.length, locale)}</span>
        </div>
      </div>
    </HistoricMap>
  </div>;
}

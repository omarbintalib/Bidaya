import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eventPlaceName, hijri, periodName } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { journeyCopy } from './copy';

/**
 * The Sirah in one minute, played on the map: thirteen moments from the birth to the year of the Prophet's death ﷺ.
 * Each moment is a Dorar event, captioned with its own title; the map draws its route or letters and lights every
 * place the sources say Islam had reached by then. Nothing is shown that the story does not already source.
 */
const BEATS: { n: number; ms: number; overview?: boolean }[] = [
  { n: 1, ms: 4500 },    // the birth
  { n: 12, ms: 4500 },   // the first revelation
  { n: 17, ms: 5000 },   // the first migration to Abyssinia
  { n: 25, ms: 5000 },   // the journey to al-Ta'if
  { n: 35, ms: 4500 },   // the second pledge of al-'Aqabah
  { n: 42, ms: 5500 },   // the Hijrah
  { n: 59, ms: 5000 },   // Badr
  { n: 101, ms: 5000 },  // the Treaty of al-Hudaybiyah
  { n: 106, ms: 6500 },  // the letters to the kings
  { n: 127, ms: 5000 },  // the conquest of Makkah
  { n: 141, ms: 5000 },  // the delegations
  { n: 143, ms: 5000 },  // the Farewell Hajj
  { n: 145, ms: 7000, overview: true }, // the year of the Prophet's death ﷺ: the whole map
];

export default function SummaryFilm({ data, locale, reducedMotion, onClose, onJump, onBeat }: {
  data: Sirah; locale: Locale; reducedMotion: boolean; onClose: () => void;
  /** Leave the film for this event in the story. */
  onJump: (n: number) => void;
  /** The event now on screen (for the background sound), or null when the film closes. */
  onBeat: (n: number | null) => void;
}) {
  const text = journeyCopy[locale];
  const beats = useMemo(() => BEATS.filter(b => data.byNumber.has(b.n)), [data]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const beat = beats[i], ev = data.byNumber.get(beat.n)!;
  const last = i === beats.length - 1;

  // Move on when the moment's time is up; stop on the last one.
  useEffect(() => {
    if (!playing || last) return;
    const id = window.setTimeout(() => setI(x => x + 1), beat.ms);
    return () => window.clearTimeout(id);
  }, [playing, i, beat.ms, last]);
  useEffect(() => { onBeat(beat.n); }, [beat.n, onBeat]);
  useEffect(() => () => onBeat(null), [onBeat]);

  // A dialog over the page: Escape closes it, focus starts on it and goes back where it was, the page does not scroll.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLButtonElement>('.film-play')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; before?.focus?.({ preventScroll: true }); };
  }, [onClose]);

  const emphasis = useCallback((e: SirahEvent): Emphasis => e.n === ev.n ? 'selected' : e.order <= ev.order ? 'past' : 'hidden', [ev]);
  const activeRoutes = useMemo(() => data.routes.filter(r => r.kind === 'sirah' && r.events.includes(ev.n)).map(r => r.id), [data, ev]);
  const title = ev.title[locale] || ev.title.ar;
  const replay = () => { setI(0); setPlaying(true); };

  return <div className="film" ref={root} role="dialog" aria-modal="true" aria-label={text.filmTitle}>
    <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={ev.n} activeRoutes={activeRoutes} onSelect={() => {}}
      reducedMotion={reducedMotion} focusKey={`film-${i}`} now={beat.overview ? Infinity : ev.order} legend={false}
      overview={!!beat.overview} caravans={ev.period === 'prologue' || ev.period === 'makkah'} insetTop={96} insetBottom={200}>
      <div className="film-top" data-map-overlay>
        <p className="film-kicker">{text.filmTitle}</p>
        <p className="film-year" key={ev.year} aria-live="polite">{hijri(ev.year, locale)}</p>
        <button type="button" className="film-close" onClick={onClose} aria-label={text.close}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>
      <div className="film-bottom" data-map-overlay>
        <div className="film-caption" key={ev.n}>
          <p className="film-period">{periodName[locale][ev.period]} · {eventPlaceName(data, ev, locale)}</p>
          <h2 lang={title === ev.title.ar ? 'ar' : undefined}>{title}</h2>
          <button type="button" className="film-read" onClick={() => onJump(ev.n)}>{text.filmRead}</button>
        </div>
        <div className="film-controls">
          <button type="button" className="film-play" onClick={() => (last ? replay() : setPlaying(p => !p))} aria-label={last ? text.filmReplay : playing ? text.pause : text.play}>
            {playing && !last ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
              : last ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8A6 6 0 1 0 16 11M15.5 3.5V8H11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <ol className="film-beats" aria-label={text.filmTitle}>
            {beats.map((b, k) => <li key={b.n}>
              <button type="button" className={k < i ? 'is-done' : k === i ? 'is-on' : ''} aria-current={k === i ? 'step' : undefined}
                aria-label={data.byNumber.get(b.n)!.title[locale] || data.byNumber.get(b.n)!.title.ar} onClick={() => setI(k)}>
                {k === i && playing && !last && <i key={`${i}-${playing}`} style={{ animationDuration: `${b.ms}ms` }} />}
              </button>
            </li>)}
          </ol>
        </div>
      </div>
    </HistoricMap>
  </div>;
}

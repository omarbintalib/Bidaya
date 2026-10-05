import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { quranpediaRefs } from '../data/quranpedia';
import { digits, eventPlaceName, hijri, periodName, versesFor } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { journeyCopy } from './copy';

/**
 * A summary of the Sirah, played on the map (summary_film.csv): moments from the birth to the year of the Prophet's
 * death ﷺ. Each is a Dorar event, told in a few sentences quoted word for word from its own text, with the verses the
 * sources tie to it (as references); the map draws its route or letters and lights every place the sources say Islam had
 * reached by then. Each moment stays as long as its words take to read, and the reader can pause or jump.
 */
export default function SummaryFilm({ data, locale, reducedMotion, onClose, onJump, onBeat }: {
  data: Sirah; locale: Locale; reducedMotion: boolean; onClose: () => void;
  /** Leave the film for this event in the story. */
  onJump: (n: number) => void;
  /** The event now on screen (for the background sound), or null when the film closes. */
  onBeat: (n: number | null) => void;
}) {
  const text = journeyCopy[locale];
  const moments = data.summary;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const moment = moments[i], ev = data.byNumber.get(moment.n)!;
  const last = i === moments.length - 1;

  // What each moment shows, and for how long: time to read its quotes (about 200 words a minute) and to watch the map.
  const told = useMemo(() => moments.map(m => {
    const e = data.byNumber.get(m.n)!, quotes = m.quotes[locale];
    const { direct, context } = versesFor(data, e);
    const words = `${e.title[locale] || e.title.ar} ${quotes.join(' ')}`.split(/\s+/).length;
    return { quotes, verses: (direct.length ? direct : context).slice(0, 3), direct: direct.length > 0, ms: Math.min(22000, Math.max(7000, 3500 + words * 300)) + (m.overview ? 2500 : 0) };
  }), [moments, data, locale]);
  const say = told[i];

  // Move on when the moment's time is up; stop on the last one.
  useEffect(() => {
    if (!playing || last) return;
    const id = window.setTimeout(() => setI(x => x + 1), say.ms);
    return () => window.clearTimeout(id);
  }, [playing, i, say.ms, last]);
  useEffect(() => { onBeat(moment.n); }, [moment.n, onBeat]);
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

  // Wide screens: the caption is a panel at the side, so the map keeps its full height (the letters reach from
  // Alexandria to Oman). Narrow screens: it sits at the bottom. Either way the map keeps the places clear of it.
  const panel = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState({ side: 0, bottom: 260 });
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => {
      const side = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;
      setCover(side ? { side: el.offsetWidth + 32, bottom: 24 } : { side: 0, bottom: el.offsetHeight + 24 });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const emphasis = useCallback((e: SirahEvent): Emphasis => e.n === ev.n ? 'selected' : e.order <= ev.order ? 'past' : 'hidden', [ev]);
  const activeRoutes = useMemo(() => data.routes.filter(r => r.kind === 'sirah' && r.events.includes(ev.n)).map(r => r.id), [data, ev]);
  const title = ev.title[locale] || ev.title.ar;
  const quoteLang = locale === 'en' && moment.quotes.en !== moment.quotes.ar ? 'en' : 'ar';
  const replay = () => { setI(0); setPlaying(true); };

  return <div className="film" ref={root} role="dialog" aria-modal="true" aria-label={text.filmTitle}>
    <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={ev.n} activeRoutes={activeRoutes} onSelect={() => {}}
      reducedMotion={reducedMotion} focusKey={`film-${i}`} now={moment.overview ? Infinity : ev.order} legend={false}
      overview={moment.overview} caravans={ev.period === 'prologue' || ev.period === 'makkah'} inset={cover.side} insetTop={96} insetBottom={cover.bottom}>
      <div className="film-top" data-map-overlay>
        <p className="film-kicker">{text.filmTitle}</p>
        <p className="film-year" key={ev.year} aria-live="polite">{hijri(ev.year, locale)}</p>
        <button type="button" className="film-close" onClick={onClose} aria-label={text.close}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>
      <div className="film-bottom" ref={panel} data-map-overlay>
        <div className="film-caption" key={ev.n}>
          <p className="film-period">{periodName[locale][ev.period]} · {eventPlaceName(data, ev, locale)}</p>
          <h2 lang={title === ev.title.ar ? 'ar' : undefined}>{title}</h2>
          {/* The source's own sentences, word for word; «…» marks what is left out between them. */}
          <p className="film-text" lang={quoteLang} dir={quoteLang === 'ar' ? 'rtl' : 'ltr'}>
            {say.quotes.map((q, k) => <span key={k}>{k > 0 && <span className="film-gap" aria-hidden="true"> … </span>}{q}</span>)}
          </p>
          {say.verses.length > 0 && <p className="film-verses">
            <span>{say.direct ? text.verses : text.contextVerses}:</span>
            {say.verses.map(v => <b key={v.id}>{locale === 'en' ? `Surah ${v.surahEn ?? v.surah}` : `سورة ${v.surah}`} {v.whole ? text.wholeSurah : digits(quranpediaRefs(v.ref, false, locale).map(r => r.label.split(':')[1]).join(locale === 'ar' ? '، ' : ', '), locale)}</b>)}
          </p>}
          <p className="film-source">{text.filmSource} · <button type="button" className="film-read" onClick={() => onJump(ev.n)}>{text.filmRead}</button></p>
        </div>
        <div className="film-controls">
          <button type="button" className="film-play" onClick={() => (last ? replay() : setPlaying(p => !p))} aria-label={last ? text.filmReplay : playing ? text.pause : text.play}>
            {last ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8A6 6 0 1 0 16 11M15.5 3.5V8H11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <ol className="film-beats" aria-label={text.filmTitle}>
            {moments.map((m, k) => <li key={m.n}>
              <button type="button" className={k < i ? 'is-done' : k === i ? 'is-on' : ''} aria-current={k === i ? 'step' : undefined}
                aria-label={data.byNumber.get(m.n)!.title[locale] || data.byNumber.get(m.n)!.title.ar} onClick={() => setI(k)}>
                {k === i && playing && !last && <i key={`${i}-${playing}`} style={{ animationDuration: `${told[k].ms}ms` }} />}
              </button>
            </li>)}
          </ol>
        </div>
      </div>
    </HistoricMap>
  </div>;
}

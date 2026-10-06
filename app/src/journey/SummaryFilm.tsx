import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { quranpediaRefs } from '../data/quranpedia';
import { digits, eventPlaceName, hijri, periodName, versesFor } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { journeyCopy } from './copy';
import SummaryAsk from './SummaryAsk';
import LanguageButton from '../navigation/LanguageButton';

/**
 * A summary of the Sirah, played on the map (summary_film.csv): moments from the birth to the year of the Prophet's
 * death ﷺ. Each is a Dorar event, told in whole passages quoted word for word from its own text, with the verses the
 * sources tie to it (as references); the map draws its route or letters and lights every place the sources say Islam had
 * reached by then. Each moment stays as long as its words take to read, and the reader can pause or jump.
 */
export default function SummaryFilm({ data, locale, reducedMotion, start = 0, onClose, onJump, onBeat }: {
  data: Sirah; locale: Locale; reducedMotion: boolean;
  /** The moment to begin at (coming back to the film after reading one of its events in the story). */
  start?: number;
  onClose: () => void;
  /** Leave the film for this event in the story; `at` is the moment the reader was on, to come back to. */
  onJump: (n: number, at: number) => void;
  /** The event now on screen (for the background sound), or null when the film closes. */
  onBeat: (n: number | null) => void;
}) {
  const text = journeyCopy[locale];
  const moments = data.summary;
  const [i, setI] = useState(() => Math.max(0, Math.min(data.summary.length - 1, start)));
  const [playing, setPlaying] = useState(true);
  const moment = moments[i], ev = data.byNumber.get(moment.n)!;
  const last = i === moments.length - 1;
  // Step to another moment: the arrows, the keys, a swipe on the caption, the list of moments or the dots.
  const go = useCallback((k: number) => setI(Math.max(0, Math.min(moments.length - 1, k))), [moments.length]);
  const [listOpen, setListOpen] = useState(false);
  // While the reader asks about a moment or reads the answer, the film waits.
  const [asking, setAsking] = useState(false);
  const onAsking = useCallback((active: boolean) => { setAsking(active); if (active) setPlaying(false); }, []);

  // What each moment shows, and for how long: time to read its passages (about 230 words a minute) and to watch the map.
  const told = useMemo(() => moments.map(m => {
    const e = data.byNumber.get(m.n)!, quotes = m.quotes[locale];
    const { direct, context } = versesFor(data, e);
    const words = `${e.title[locale] || e.title.ar} ${quotes.join(' ')}`.split(/\s+/).length;
    return { quotes, verses: (direct.length ? direct : context).slice(0, 3), direct: direct.length > 0, ms: Math.min(32000, Math.max(8000, 3000 + words * 260)) + (m.overview ? 2500 : 0) };
  }), [moments, data, locale]);
  const say = told[i];

  // Move on when the moment's time is up; stop on the last one.
  useEffect(() => {
    if (!playing || last || asking) return;
    const id = window.setTimeout(() => setI(x => x + 1), say.ms);
    return () => window.clearTimeout(id);
  }, [playing, i, say.ms, last, asking]);
  useEffect(() => { onBeat(moment.n); }, [moment.n, onBeat]);
  useEffect(() => () => onBeat(null), [onBeat]);

  // A dialog over the page: Escape closes it, focus starts on it and goes back where it was, the page does not scroll.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLButtonElement>('.film-play')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement).closest('input, textarea');
      if (e.key === 'Escape') { e.preventDefault(); if (typing) (e.target as HTMLElement).blur(); else if (listRef.current) setListOpen(false); else onClose(); }
      if (typing) return;
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); setPlaying(p => !p); }
      // The arrow toward the reading direction goes on (← in Arabic, → in English).
      const on = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight', back = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === on || e.key === back) { e.preventDefault(); setI(x => Math.max(0, Math.min(moments.length - 1, x + (e.key === on ? 1 : -1)))); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; before?.focus?.({ preventScroll: true }); };
  }, [onClose, locale, moments.length]);
  const listRef = useRef(false);
  listRef.current = listOpen;
  // A swipe across the caption on a phone: toward the reading direction goes on.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current, t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(i + ((dx < 0) === (locale !== 'ar') ? 1 : -1));
  };

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
        <div className="film-end">
          <LanguageButton locale={locale} className="film-lang" />
          <button type="button" className="film-close" onClick={onClose} aria-label={text.close}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
      </div>
      <div className="film-bottom" ref={panel} data-map-overlay>
        <div className="film-caption" key={ev.n} onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }} onTouchEnd={onTouchEnd}>
          <p className="film-period">{periodName[locale][ev.period]} · {eventPlaceName(data, ev, locale)}</p>
          <h2 lang={title === ev.title.ar ? 'ar' : undefined}>{title}</h2>
          {/* The source's own passages, word for word, each whole; «…» opens a passage that follows a part left out. */}
          <div className="film-text" lang={quoteLang} dir={quoteLang === 'ar' ? 'rtl' : 'ltr'}>
            {say.quotes.map((q, k) => <p key={k}>{k > 0 && <span className="film-gap" aria-hidden="true">… </span>}{q}</p>)}
          </div>
          {say.verses.length > 0 && <p className="film-verses">
            <span>{say.direct ? text.verses : text.contextVerses}:</span>
            {say.verses.map(v => <b key={v.id}>{locale === 'en' ? `Surah ${v.surahEn ?? v.surah}` : `سورة ${v.surah}`} {v.whole ? text.wholeSurah : digits(quranpediaRefs(v.ref, false, locale).map(r => r.label.split(':')[1]).join(locale === 'ar' ? '، ' : ', '), locale)}</b>)}
          </p>}
          <p className="film-source">{text.filmSource} · <button type="button" className="film-read" onClick={() => onJump(ev.n, i)}>{text.filmRead}</button></p>
          <SummaryAsk key={ev.n} data={data} locale={locale} event={ev} quotes={say.quotes} onActive={onAsking} onOpenEvent={n => onJump(n, i)} />
        </div>
        {listOpen && <ol className="film-list" aria-label={text.filmMoments}>
          {moments.map((m, k) => { const e = data.byNumber.get(m.n)!; return <li key={m.n}>
            <button type="button" aria-current={k === i ? 'step' : undefined} onClick={() => { go(k); setListOpen(false); }}>
              <span>{hijri(e.year, locale)}</span>{e.title[locale] || e.title.ar}
            </button>
          </li>; })}
        </ol>}
        <div className="film-controls">
          <button type="button" className="film-step" onClick={() => go(i - 1)} disabled={i === 0} aria-label={text.filmPrev}><Chevron back /></button>
          <button type="button" className="film-play" onClick={() => (last ? replay() : setPlaying(p => !p))} aria-label={last ? text.filmReplay : playing ? text.pause : text.play}>
            {last ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8A6 6 0 1 0 16 11M15.5 3.5V8H11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <button type="button" className="film-step" onClick={() => go(i + 1)} disabled={last} aria-label={text.filmNext}><Chevron /></button>
          <ol className="film-beats" aria-label={text.filmTitle}>
            {moments.map((m, k) => <li key={m.n}>
              <button type="button" className={k < i ? 'is-done' : k === i ? 'is-on' : ''} aria-current={k === i ? 'step' : undefined}
                aria-label={data.byNumber.get(m.n)!.title[locale] || data.byNumber.get(m.n)!.title.ar} onClick={() => setI(k)}>
                {k === i && playing && !last && <i key={`${i}-${playing}`} style={{ animationDuration: `${told[k].ms}ms` }} />}
              </button>
            </li>)}
          </ol>
          <button type="button" className="film-count" aria-expanded={listOpen} aria-label={`${text.filmMoments}: ${i + 1} / ${moments.length}`} onClick={() => setListOpen(o => !o)}>
            {digits(i + 1, locale)} / {digits(moments.length, locale)}
          </button>
        </div>
      </div>
    </HistoricMap>
  </div>;
}

function Chevron({ back }: { back?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={back ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

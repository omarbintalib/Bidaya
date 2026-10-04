import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { dateLine, digits, excerpt, hijri } from '../data/select';
import type { Sirah, SirahEvent } from '../data/types';
import { useSirah } from '../data/useSirah';
import { copy, type Locale } from '../i18n';
import { journeyCopy } from '../journey/copy';
import HistoricMap, { type Emphasis } from '../map/HistoricMap';
import { routeFor } from '../navigation/routes';
import '../journey/journey.css';

const spreadCopy = {
  ar: {
    year: 'السنة', play: 'تشغيل', pause: 'إيقاف', slider: 'اختر السنة الهجرية',
    places: 'مكانًا بلغته الأحداث', events: 'حدثًا حتى هذه السنة', thisYear: 'أحداث هذه السنة', none: 'لا أحداث مؤرخة بهذه السنة في مصادر المشروع.',
    intro: 'تتبّع كيف امتدت أحداث السيرة من مكة إلى أرجاء الجزيرة، سنة بعد سنة.',
  },
  en: {
    year: 'Year', play: 'Play', pause: 'Pause', slider: 'Choose the Hijri year',
    places: 'places reached', events: 'events so far', thisYear: 'Events this year', none: "No events are dated to this year in the project's sources.",
    intro: 'Follow how the events of the Sirah reached out from Makkah across Arabia, year by year.',
  },
};

export default function SpreadPage({ locale }: { locale: Locale }) {
  const state = useSirah(), jtext = journeyCopy[locale];
  return <main className="explorer journey-page spread-page">
    <section className="intro">
      <p className="eyebrow"><span />{copy[locale].eyebrow}</p>
      <h1 tabIndex={-1} data-page-heading>{routeFor('spread')[locale].title}</h1>
      <p className="intro-subtitle">{spreadCopy[locale].intro}</p>
    </section>
    {state.status === 'ready' ? <Spread data={state.data} locale={locale} />
      : <p className={`data-status${state.status === 'error' ? ' is-error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>{state.status === 'error' ? jtext.error : jtext.loading}</p>}
  </main>;
}

function Spread({ data, locale }: { data: Sirah; locale: Locale }) {
  const { reducedMotion } = useAccessibility();
  const text = spreadCopy[locale];
  // From the first revelation (13 BH) to the year of the Prophet's death ﷺ (11 AH).
  const years = useMemo(() => [...new Set(data.events.filter(e => e.year !== null && e.period !== 'prologue').map(e => e.year!))].sort((a, b) => a - b), [data]);
  const [yi, setYi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const year = years[yi];

  useEffect(() => {
    if (!playing) return;
    if (yi >= years.length - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setYi(i => i + 1), 2200);
    return () => window.clearTimeout(id);
  }, [playing, yi, years.length]);
  useEffect(() => setPicked(null), [yi]);

  const inScope = (e: SirahEvent) => e.period !== 'prologue' && e.year !== null;
  const yearEvents = useMemo(() => data.events.filter(e => inScope(e) && e.year === year), [data, year]);
  const sofar = useMemo(() => data.events.filter(e => inScope(e) && e.year! <= year), [data, year]);
  const placeCount = new Set(sofar.filter(e => e.lat !== null).map(e => e.place)).size;
  const emphasis = useCallback((e: SirahEvent): Emphasis => {
    if (!inScope(e) || e.year! > year) return 'hidden';
    if (e.n === picked) return 'selected';
    return e.year === year ? 'active' : 'past';
  }, [year, picked]);
  const chosen = picked === null ? null : data.byNumber.get(picked) ?? null;

  return <>
    <div className="journey-grid">
      <HistoricMap data={data} locale={locale} emphasis={emphasis} selected={picked} onSelect={setPicked} reducedMotion={reducedMotion} focusKey={picked ?? undefined}
        caption={`${text.year}: ${hijri(year, locale)}`} />
      <aside className="journey-panel spread-panel" aria-live="polite">
        <p className="spread-year">{hijri(year, locale)}</p>
        <div className="spread-stats">
          <p><b>{digits(placeCount, locale)}</b> {text.places}</p>
          <p><b>{digits(sofar.length, locale)}</b> {text.events}</p>
        </div>
        <h2 className="spread-h">{text.thisYear}</h2>
        {yearEvents.length ? <ol className="spread-list">
          {yearEvents.map(e => <li key={e.n}>
            <button type="button" aria-expanded={picked === e.n} onClick={() => setPicked(picked === e.n ? null : e.n)}>
              <span>{e.title[locale] || e.title.ar}</span><small>{e.placeName[locale]}</small>
            </button>
            {chosen?.n === e.n && <div className="spread-detail">
              <p className="spread-date">{dateLine(e, locale)}</p>
              <p lang={locale === 'en' && e.text.en ? 'en' : 'ar'}>{excerpt((locale === 'en' && e.text.en) || e.text.ar, 260)}</p>
              <a href={e.url} target="_blank" rel="noreferrer">{journeyCopy[locale].dorar} · {e.n}</a>
            </div>}
          </li>)}
        </ol> : <p className="spread-none">{text.none}</p>}
      </aside>
    </div>
    <section className="spread-controls" aria-label={text.slider}>
      <button type="button" className="tl-btn tl-play" onClick={() => { if (yi >= years.length - 1) setYi(0); setPlaying(p => !p); }} aria-pressed={playing}>
        {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
        <span>{playing ? text.pause : text.play}</span>
      </button>
      <div className="spread-slider">
        <input type="range" min={0} max={years.length - 1} step={1} value={yi} aria-label={text.slider} aria-valuetext={hijri(year, locale)}
          onChange={ev => { setPlaying(false); setYi(Number(ev.target.value)); }} />
        <div className="spread-ticks" aria-hidden="true">{years.map((y, i) => <span key={y} className={i === yi ? 'is-on' : ''} style={{ insetInlineStart: `${(i / (years.length - 1)) * 100}%` }}>{y === 0 || i % 2 === 0 || i === years.length - 1 ? hijri(y, locale) : ''}</span>)}</div>
      </div>
    </section>
  </>;
}

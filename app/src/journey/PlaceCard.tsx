import { useEffect, useRef } from 'react';
import { hijri } from '../data/select';
import type { Sirah } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

/** A place's card: its name then and now, when Islam reached it, and its events. */
export default function PlaceCard({ placeKey, data, locale, onClose, onEvent }: { placeKey: string; data: Sirah; locale: Locale; onClose: () => void; onEvent: (n: number) => void }) {
  const text = journeyCopy[locale], en = locale === 'en';
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal?.(); }, []);
  const place = data.places.get(placeKey);
  if (!place) return null;
  const events = data.events.filter(e => e.place === placeKey).sort((a, b) => a.order - b.order);
  const reached = place.reached !== null ? data.byNumber.get(place.reached) : undefined;

  return <dialog ref={dialog} className="person-dialog place-card" aria-labelledby="place-title" onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="pd-head">
      <div>
        <p className="pd-kind">{text.placeKind}{!place.confirmed && <> · <span className="place-approx">{text.placeApprox}</span></>}</p>
        <h2 id="place-title">{place.name[locale]}</h2>
        {en && <p className="pd-ar" lang="ar" dir="rtl">{place.name.ar}</p>}
      </div>
      <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
    </header>
    <div className="pd-body">
      {(place.nameBefore || reached) && <dl className="pd-facts">
        {place.nameBefore && <div><dt>{text.placeEarlier}</dt><dd>{place.nameBefore[locale]}{place.nameNote && <small className="place-note">{place.nameNote[locale]}</small>}</dd></div>}
        {reached && <div><dt>{text.placeReached}</dt><dd>
          <button type="button" className="place-link" onClick={() => { onEvent(reached.n); onClose(); }}>{hijri(reached.year, locale)} · {reached.title[locale] || reached.title.ar}</button>
          {place.reachQuote && <q className="pd-quote" lang="ar" dir="rtl">{place.reachQuote}</q>}
        </dd></div>}
      </dl>}

      <section className="pd-events">
        <h3>{text.placeEvents(events.length)}</h3>
        {events.length ? <ul>{events.map(e => <li key={e.n}>
          <button type="button" onClick={() => { onEvent(e.n); onClose(); }}>
            <span className="pd-ev-head"><span>{e.title[locale] || e.title.ar}</span><small>{hijri(e.year, locale)}</small></span>
          </button>
        </li>)}</ul> : <p className="pd-note">{text.placeNoEvents}</p>}
      </section>
    </div>
  </dialog>;
}

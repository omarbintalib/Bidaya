import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { findPeople } from '../data/people';
import { hijri } from '../data/select';
import type { Person, Sirah } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

interface PeopleApi { data: Sirah; open: (person: Person) => void }
const PeopleContext = createContext<PeopleApi | null>(null);
export const PeopleProvider = PeopleContext.Provider;
export const usePeople = () => useContext(PeopleContext);

/** Text with the Companions' names turned into buttons that open their card — the first mention of each
 * person only, so long passages stay calm. Plain text outside a provider. */
export function PeopleText({ text, lang }: { text: string; lang: 'ar' | 'en' }) {
  const api = usePeople();
  const parts = useMemo(() => {
    if (!api) return [text];
    const out: ReactNode[] = [];
    let at = 0;
    const seen = new Set<string>();
    for (const span of findPeople(api.data, text, lang)) {
      if (seen.has(span.person.id)) continue;
      seen.add(span.person.id);
      if (span.start > at) out.push(text.slice(at, span.start));
      out.push(<button key={span.start} type="button" className="person-link" onClick={() => api.open(span.person)}>{text.slice(span.start, span.end)}</button>);
      at = span.end;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }, [api, text, lang]);
  return <>{parts}</>;
}

/** English labels for the النوع column; anything not listed shows as written. */
const KIND_EN: Record<string, string> = {
  'صحابي': 'Companion', 'صحابية': 'Companion', 'من أسرة النبي ﷺ': 'Family of the Prophet ﷺ', 'من مشركي قريش': 'Polytheist of Quraysh',
  'من قريش': 'Of Quraysh', 'من أهل مكة': 'Of Makkah', 'من المنافقين': 'Among the hypocrites', 'من يهود المدينة': 'Jew of Madinah',
  'من يهود بني النضير': 'Jew of Banu al-Nadir', 'راهب نصراني': 'Christian monk', 'مولى جبير بن مطعم': "Slave of Jubayr ibn Mut'im",
  'ملك الحبشة': 'King of Abyssinia', 'ملك الروم': 'Byzantine emperor', 'ملك الفرس': 'Persian emperor', 'ملك الإسكندرية': 'Ruler of Alexandria',
};

/** A person's card: name, cited synopsis, and the events the sources link them to. */
export function PersonDialog({ person, data, locale, onClose, onEvent }: { person: Person; data: Sirah; locale: Locale; onClose: () => void; onEvent: (n: number) => void }) {
  const text = journeyCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    // No close() on cleanup: in development React runs effects twice, and closing here would fire onClose
    // and dismiss the dialog the moment it opens. Removing the element on unmount closes it anyway.
  }, []);
  const events = person.events.map(n => data.byNumber.get(n)).filter(e => e !== undefined).sort((a, b) => a.order - b.order);
  const title = person.name[locale];

  return <dialog ref={dialog} className="person-dialog" aria-labelledby="person-title" onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="pd-head">
      <div>
        <p className="pd-kind">{locale === 'en' ? KIND_EN[person.kind] ?? person.kind : person.kind}</p>
        <h2 id="person-title">{title}</h2>
        {locale === 'en' && <p className="pd-ar" lang="ar" dir="rtl">{person.name.ar}</p>}
      </div>
      <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
    </header>
    <div className="pd-body">
      <dl className="pd-facts">
        <div><dt>{text.islamWhen}</dt><dd lang="ar">{person.islam ?? text.notStated}</dd></div>
        <div><dt>{text.death}</dt><dd lang="ar">{person.death ?? text.notStated}</dd></div>
      </dl>
      {locale === 'en' && <p className="pd-note">{text.bioInArabic}</p>}
      <p className="pd-bio" lang="ar" dir="rtl">{person.bio}</p>
      {events.length > 0 && <section className="pd-events">
        <h3>{text.personEvents}</h3>
        <ul>{events.map(e => <li key={e.n}><button type="button" onClick={() => { onEvent(e.n); onClose(); }}>
          <span>{e.title[locale] || e.title.ar}</span><small>{hijri(e.year, locale)}</small>
        </button></li>)}</ul>
      </section>}
      <p className="pd-source">{text.personSource}</p>
    </div>
  </dialog>;
}

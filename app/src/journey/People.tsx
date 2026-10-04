import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { findPeople, mentionIn } from '../data/people';
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

/** Source references in the interface language: «حدث 14» → "event 14", «صحيح مسلم 1748» → "Sahih Muslim 1748". */
const sourceLabel = (s: string, locale: Locale) => locale === 'ar' ? s : s
  .replace(/^الدرر السنية · /, 'Dorar · ').replace(/حدث\s*(\d+)/g, 'event $1')
  .replace(/صحيح البخاري/g, 'Sahih al-Bukhari').replace(/صحيح مسلم/g, 'Sahih Muslim').replace(/[،؛]/g, ',');

/** ﷺ is an Arabic-script character: in English text a left-to-right mark after it keeps the words and numbers
 *  that follow in English order ("the Prophet ﷺ — 13 BH", not "13 — ﷺ BH"). */
const ltr = (s: string) => s.replace(/ﷺ(?!\u200E)/g, 'ﷺ\u200E');

/** Source sentences can start or end mid-quote; drop the stray marks so the paragraph reads cleanly. */
const tidy = (s: string) => s.replace(/^(…\s*|[”“"'’‘]\s*)+/, '').replace(/(\s*…)+$/, '…').trim();

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
  const sources = person.facts.filter((f, i, all) => all.findIndex(g => g.source === f.source) === i);
  // Dorar events are grouped into one item ("الدرر السنية: حدث 14، حدث 42"); other references follow it.
  const dorar = sources.filter(f => f.url && f.source.startsWith('الدرر السنية · ')), others = sources.filter(f => !dorar.includes(f));

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
      {/* Only what the sources state is shown; a fact they do not give is simply left out. */}
      {(person.islam || person.death) && <dl className="pd-facts">
        {person.islam && <div><dt>{text.islamWhen}</dt>{locale === 'en' && person.islamEn ? <dd dir="ltr">{ltr(person.islamEn)}</dd> : <dd lang="ar">{person.islam}</dd>}</div>}
        {person.death && <div><dt>{text.death}</dt>{locale === 'en' && person.deathEn ? <dd dir="ltr">{ltr(person.deathEn)}</dd> : <dd lang="ar">{person.death}</dd>}</div>}
      </dl>}
      {locale === 'en' && person.bioEn ? <>
          {/* A translation; the cited Arabic summary stays one tap away as its reference. */}
          <p className="pd-bio">{ltr(person.bioEn)}</p>
          <details className="pd-original"><summary>{text.originalArabic}</summary><p className="pd-bio" lang="ar" dir="rtl">{person.bio}</p></details>
        </>
        : <>{locale === 'en' && <p className="pd-note">{text.bioInArabic}</p>}<p className="pd-bio" lang="ar" dir="rtl">{person.bio}</p></>}
      {/* Where the summary comes from: one short line of sources, and the sources' own words on request. */}
      {sources.length > 0 && <p className="pd-sources" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <span>{text.sourcesLabel}</span>
        {dorar.length > 0 && <span>{locale === 'ar' ? 'الدرر السنية: ' : 'Dorar: '}{dorar.map((f, i) => <span key={f.source}>{i > 0 && (locale === 'ar' ? '، ' : ', ')}<a href={f.url!} target="_blank" rel="noreferrer">{sourceLabel(f.source.replace(/^الدرر السنية · /, ''), locale)}</a></span>)}</span>}
        {others.map((f, i) => <span key={f.source}>{(dorar.length > 0 || i > 0) && ' · '}{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{sourceLabel(f.source, locale)}</a> : sourceLabel(f.source, locale)}</span>)}
      </p>}
      {person.facts.length > 0 && <details className="pd-quotes">
        <summary>{text.sourceTexts(person.facts.length)}</summary>
        <ul lang="ar" dir="rtl">{person.facts.map((f, i) => <li key={i}><q className="pd-quote">{f.quote}</q><small lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>{sourceLabel(f.source, locale)}</small></li>)}</ul>
      </details>}
      {events.length > 0 && <section className="pd-events">
        <h3>{text.personEvents}</h3>
        <ul>{events.map(e => {
          // Under each event's title, the sentence of Dorar's Arabic text naming this person (Arabic interface only).
          const said = locale === 'ar' ? mentionIn(data, person, e, 'ar') : null;
          return <li key={e.n}>
            <button type="button" onClick={() => { onEvent(e.n); onClose(); }}>
              <span className="pd-ev-head"><span>{e.title[locale] || e.title.ar}</span><small>{hijri(e.year, locale)}</small></span>
              {said && <q className="pd-quote" lang={said.lang} dir={said.lang === 'ar' ? 'rtl' : 'ltr'}>{tidy(said.text)}</q>}
            </button>
          </li>;
        })}</ul>
        {locale === 'ar' && <p className="pd-quote-note">{text.quoteNote}</p>}
      </section>}
      <p className="pd-source">{text.personSource}</p>
    </div>
  </dialog>;
}

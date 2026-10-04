import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { findPeople, mentionIn, sentenceNaming } from '../data/people';
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
  // English synopsis that mirrors the Arabic one: the same facts in the same order, each given in its own source's
  // English, word for word — Dorar's English for a Dorar event, the hadith's English for a Bukhari/Muslim fact.
  // A fact whose source has no English keeps its Arabic sentence, so nothing is dropped. Nothing is translated here.
  type Part = { en: string; src: { label: string; url: string } } | { ar: string };
  const enParts: Part[] = locale === 'en' && !person.bioEn ? person.facts.filter(f => person.bio.includes(f.text)).map((f): Part => {
    const ev = /حدث (\d+)/.exec(f.ref)?.[1], e = ev ? data.byNumber.get(Number(ev)) : undefined;
    if (e) {
      const m = mentionIn(data, person, e, 'en');
      if (m?.lang === 'en') return { en: tidy(m.text), src: { label: `Dorar, ${text.eventN(e.n)}`, url: e.urlEn || e.url } };
    }
    const h = data.verses.find(v => v.id === f.ref)?.hadithEn;
    if (h) {
      const line = sentenceNaming(data, person, h.text, 'en', 320) ?? h.text.split(/(?<=[.!?])\s/)[0];
      return { en: tidy(line), src: { label: h.ref, url: h.url } };
    }
    return { ar: f.text };
  }).filter((p, i, all) => !('en' in p) || all.findIndex(q => 'en' in q && q.en === p.en) === i) : [];
  const enSources = enParts.flatMap(p => ('src' in p ? [p.src] : [])).filter((s, i, all) => all.findIndex(x => x.label === s.label) === i);
  const hasEn = enParts.some(p => 'en' in p);

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
        {person.islam && <div><dt>{text.islamWhen}</dt>{locale === 'en' && person.islamEn ? <dd>{person.islamEn}</dd> : <dd lang="ar">{person.islam}</dd>}</div>}
        {person.death && <div><dt>{text.death}</dt>{locale === 'en' && person.deathEn ? <dd>{person.deathEn}</dd> : <dd lang="ar">{person.death}</dd>}</div>}
      </dl>}
      {locale === 'en' && person.bioEn ? <p className="pd-bio">{person.bioEn}</p>
        : hasEn ? <>
            {/* One paragraph, like the Arabic summary, then one line of sources. */}
            <p className="pd-bio">{enParts.map((p, i) => <span key={i}>{i > 0 && ' '}{'en' in p ? p.en : <span lang="ar" dir="rtl">{p.ar}</span>}</span>)}</p>
            <p className="pd-sources">{text.sourcesLabel}{enSources.map((s, i) => <span key={s.label}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>
            <details className="pd-original"><summary>{text.originalSummary}</summary><p className="pd-bio" lang="ar" dir="rtl">{person.bio}</p></details>
          </>
        : <>{locale === 'en' && <p className="pd-note">{text.bioInArabic}</p>}<p className="pd-bio" lang="ar" dir="rtl">{person.bio}</p></>}
      {/* Where the summary comes from: one short line of sources, and the sources' own words on request. */}
      {sources.length > 0 && !hasEn && <p className="pd-sources" lang="ar" dir="rtl">
        <span>{text.sourcesLabel}</span>
        {dorar.length > 0 && <span>الدرر السنية: {dorar.map((f, i) => <span key={f.source}>{i > 0 && '، '}<a href={f.url!} target="_blank" rel="noreferrer">{f.source.replace(/^الدرر السنية · /, '')}</a></span>)}</span>}
        {others.map((f, i) => <span key={f.source}>{(dorar.length > 0 || i > 0) && ' · '}{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.source}</a> : f.source}</span>)}
      </p>}
      {person.facts.length > 0 && <details className="pd-quotes">
        <summary>{text.sourceTexts(person.facts.length)}</summary>
        <ul lang="ar" dir="rtl">{person.facts.map((f, i) => <li key={i}><q className="pd-quote">{f.quote}</q><small>{f.source}</small></li>)}</ul>
      </details>}
      {events.length > 0 && <section className="pd-events">
        <h3>{text.personEvents}</h3>
        <ul>{events.map(e => {
          // In English the synopsis above already quotes Dorar's English for these events, so only titles are listed.
          const said = hasEn ? null : mentionIn(data, person, e, locale);
          return <li key={e.n}>
            <button type="button" onClick={() => { onEvent(e.n); onClose(); }}>
              <span className="pd-ev-head"><span>{e.title[locale] || e.title.ar}</span><small>{hijri(e.year, locale)}</small></span>
              {said && <q className="pd-quote" lang={said.lang} dir={said.lang === 'ar' ? 'rtl' : 'ltr'}>{said.text}</q>}
            </button>
          </li>;
        })}</ul>
        <p className="pd-quote-note">{text.quoteNote}</p>
      </section>}
      <p className="pd-source">{text.personSource}</p>
    </div>
  </dialog>;
}

import { useState } from 'react';
import { quranpediaRefs, type QuranRef } from '../data/quranpedia';
import { dateLine, excerpt, hadithLinks, periodName, peopleFor, versesFor } from '../data/select';
import type { Person, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';
import QuranReader from './QuranReader';

/** Arabic-only source text keeps its own language and direction inside the English interface. */
/** Characters of the event text shown before "Read the full text" — about three lines. */
const EXCERPT = 200;

const Ar = ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: 'span' | 'p' }) => <Tag lang="ar" dir="rtl">{children}</Tag>;

export default function EventCard({ data, event, locale }: { data: Sirah; event: SirahEvent; locale: Locale }) {
  const text = journeyCopy[locale];
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const verses = versesFor(data, event);
  const people = peopleFor(data, event);
  const body = (locale === 'en' && event.text.en) || event.text.ar;
  const bodyLang = body === event.text.ar ? 'ar' : 'en';
  const title = event.title[locale] || event.title.ar;
  const chosen = people.find(p => p.id === person) ?? null;

  return <article className="ecard" key={event.n} aria-labelledby={`ev-${event.n}`}>
    <p className="ecard-period"><span />{periodName[locale][event.period]}</p>
    <h2 id={`ev-${event.n}`} className="ecard-title" lang={title === event.title.ar ? 'ar' : undefined}>{title}</h2>
    <dl className="ecard-facts">
      <div><dt>{text.when}</dt><dd>{dateLine(event, locale) || '—'}</dd></div>
      <div><dt>{text.place}</dt><dd>{event.placeName[locale] || '—'}{event.precision !== 'exact' && <span className={`prec prec-${event.precision}`}>{text.precision[event.precision]}</span>}</dd></div>
    </dl>
    {event.inferred && <p className="ecard-flag">{text.inferred}</p>}

    {locale === 'en' && !event.text.en && <p className="ecard-flag">{text.noEnglish}</p>}
    <div className="ecard-text" lang={bodyLang} dir={bodyLang === 'ar' ? 'rtl' : 'ltr'}>
      <p>{open ? body : excerpt(body, EXCERPT)}</p>
    </div>
    {body.length > EXCERPT && <button type="button" className="ecard-more" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? text.readLess : text.readMore}</button>}
    <p className="ecard-source">{text.source}: <a href={locale === 'en' && event.urlEn ? event.urlEn : event.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {event.n}</a></p>

    {verses.direct.length > 0 && <VerseList title={text.verses} verses={verses.direct} locale={locale} />}
    {verses.context.length > 0 && <VerseList title={text.contextVerses} verses={verses.context} locale={locale} />}
    {verses.stage.length > 0 && <details className="ecard-section ecard-more-verses">
      <summary><h3>{text.stageVerses}</h3><span className="count">{verses.stage.length}</span></summary>
      <ul className="verses is-compact">{verses.stage.map(v => <VerseItem key={v.id} v={v} locale={locale} compact />)}</ul>
    </details>}

    {people.length > 0 && <section className="ecard-section">
      <h3>{text.people}</h3>
      <ul className="ecard-people">
        {people.map(p => <li key={p.id}><button type="button" aria-expanded={person === p.id} onClick={() => setPerson(person === p.id ? null : p.id)}>{p.name[locale]}</button></li>)}
      </ul>
      {chosen && <PersonBio person={chosen} locale={locale} />}
    </section>}
  </article>;
}

function VerseList({ title, verses, locale, compact = false }: { title: string; verses: Verse[]; locale: Locale; compact?: boolean }) {
  return <section className="ecard-section">
    <h3>{title}</h3>
    <ul className={`verses${compact ? ' is-compact' : ''}`}>{verses.map(v => <VerseItem key={v.id} v={v} locale={locale} compact={compact} />)}</ul>
  </section>;
}

export function VerseItem({ v, locale, compact = false }: { v: Verse; locale: Locale; compact?: boolean }) {
  const text = journeyCopy[locale];
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<QuranRef | null>(null);
  const refs = quranpediaRefs(v.ref, v.whole, locale);
  const surahName = locale === 'ar' ? `سورة ${v.surah}` : `Surah ${v.surah}`;
  const label = v.link?.label;
  return <li className="verse">
    <p className="verse-ref">
      <span className="verse-surah">{surahName}</span>
      {refs.map(r => <a key={r.url} className="verse-ayat" href={r.url} target="_blank" rel="noreferrer" title={text.readQuranpedia}
        onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setReading(r); }}>
        {v.whole ? text.wholeSurah : r.label}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h4.2c.8 0 .8.6.8.6v9s0-.6-.8-.6H3zM13 3.5H8.8c-.8 0-.8.6-.8.6v9s0-.6.8-.6H13z" fill="none" stroke="currentColor" /></svg>
      </a>)}
    </p>
    {reading && <QuranReader title={surahName} quranRef={reading} locale={locale} onClose={() => setReading(null)} />}
    <p className="verse-title">{v.title[locale]}</p>
    <p className="verse-phrase">{v.phrase[locale]}</p>
    {label && v.link?.type !== 'direct' && <p className="verse-label"><Ar>{label}</Ar></p>}
    {!compact && <>
      <button type="button" className="verse-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{text.reason}</button>
      {open && <div className="verse-detail">
        {v.reason && <Ar as="p">{v.reason}</Ar>}
        {(v.evidence[locale] || v.evidence.ar) && <p className="verse-evidence" lang={v.evidence[locale] ? locale : 'ar'}>{v.evidence[locale] || v.evidence.ar}</p>}
        <p className="verse-refs">
          {hadithLinks(v).map(h => <a key={h.book + h.n} href={h.url} target="_blank" rel="noreferrer">{text[h.book]} {h.n}</a>)}
          {v.tafseer.slice(0, 1).map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{text.tafseer}</a>)}
        </p>
        {v.narrator && <p className="verse-narrator">{text.narrator}: <Ar>{v.narrator}</Ar></p>}
      </div>}
    </>}
  </li>;
}

function PersonBio({ person, locale }: { person: Person; locale: Locale }) {
  const text = journeyCopy[locale];
  return <div className="person-bio">
    <p className="person-name"><Ar>{person.name.ar}</Ar>{locale === 'en' && <span> · {person.name.en}</span>}</p>
    <Ar as="p">{person.bio}</Ar>
    {person.death && <p className="person-death">{text.death}: <Ar>{person.death}</Ar></p>}
  </div>;
}

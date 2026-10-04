import { useState } from 'react';
import { quranpediaRefs, type QuranRef } from '../data/quranpedia';
import { dateLine, excerpt, hadithLinks, hijri, periodName, peopleFor, versesFor } from '../data/select';
import type { Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';
import QuranReader from './QuranReader';
import { PeopleText, usePeople } from './People';

/** The opening of an event's text: its first sentence when that is a readable length, else about two lines. */
function lead(body: string) {
  const m = body.slice(40, 260).search(/[.!؟](\s|$)/);
  return m >= 0 ? body.slice(0, 40 + m + 1).trim() : excerpt(body, 180);
}

/** Arabic-only source text keeps its own language and direction inside the English interface. */
const Ar = ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: 'span' | 'p' }) => <Tag lang="ar" dir="rtl">{children}</Tag>;

interface CardProps { data: Sirah; event: SirahEvent; locale: Locale; chapter: number; yearEvents: SirahEvent[]; onPick: (n: number) => void; onWalk?: () => void; walkName?: string }

export default function EventCard({ data, event, locale, chapter, yearEvents, onPick, onWalk, walkName }: CardProps) {
  const text = journeyCopy[locale];
  const [open, setOpen] = useState(false);
  const peopleApi = usePeople();
  const verses = versesFor(data, event);
  const people = peopleFor(data, event);
  const body = (locale === 'en' && event.text.en) || event.text.ar;
  const bodyLang = body === event.text.ar ? 'ar' : 'en';
  const title = event.title[locale] || event.title.ar;
  const opening = lead(body), rest = body.slice(opening.replace(/…$/, '').length).trim();
  const at = yearEvents.findIndex(e => e.n === event.n);

  return <article className="ecard" key={event.n} aria-labelledby={`ev-${event.n}`}>
    {yearEvents.length > 1 && <nav className="ecard-year" aria-label={text.yearNav}>
      <span className="ecard-year-label">{text.inYear(hijri(event.year, locale), at + 1, yearEvents.length)}</span>
      <ol>{yearEvents.map(e => <li key={e.n}><button type="button" className={e.n === event.n ? 'is-on' : ''} aria-current={e.n === event.n ? 'step' : undefined} title={e.title[locale] || e.title.ar} aria-label={e.title[locale] || e.title.ar} onClick={() => onPick(e.n)} /></li>)}</ol>
    </nav>}
    <p className="ecard-period"><span />{text.chapter(chapter)} · {periodName[locale][event.period]}</p>
    <h2 id={`ev-${event.n}`} className="ecard-title" lang={title === event.title.ar ? 'ar' : undefined}>{title}</h2>
    <p className="ecard-meta">
      <span>{dateLine(event, locale) || '—'}</span>
      <span aria-hidden="true">·</span>
      <span>{event.placeName[locale] || '—'}</span>
      {event.precision !== 'exact' && <span className={`prec prec-${event.precision}`}>{text.precision[event.precision]}</span>}
    </p>
    {event.inferred && <p className="ecard-flag">{text.inferred}</p>}

    {locale === 'en' && !event.text.en && <p className="ecard-flag">{text.noEnglish}</p>}
    <div className="ecard-text" lang={bodyLang} dir={bodyLang === 'ar' ? 'rtl' : 'ltr'}>
      <p className="ecard-lead"><PeopleText text={opening} lang={bodyLang} /></p>
      {open && rest && <p><PeopleText text={rest} lang={bodyLang} /></p>}
    </div>
    {rest && <button type="button" className="ecard-more" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? text.readLess : text.readMore}</button>}
    {onWalk && walkName && <button type="button" className="ecard-walk" onClick={onWalk}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18c3-6 6 2 9-4s5-6 7-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" /><circle cx="4" cy="18" r="2" fill="currentColor" /><circle cx="20" cy="6" r="2" fill="currentColor" /></svg>
      {text.walk(walkName)}
    </button>}
    <p className="ecard-source">{text.source}: <a href={locale === 'en' && event.urlEn ? event.urlEn : event.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {event.n}</a></p>

    {people.length > 0 && <section className="ecard-section">
      <h3>{text.people}</h3>
      <ul className="ecard-people">
        {people.map(p => <li key={p.id}><button type="button" aria-haspopup="dialog" onClick={() => peopleApi?.open(p)}>{p.name[locale]}</button></li>)}
      </ul>
    </section>}

    {verses.direct.length > 0 && <VerseList title={text.verses} verses={verses.direct} locale={locale} />}
    {verses.context.length > 0 && <VerseList title={text.contextVerses} verses={verses.context} locale={locale} />}
    {verses.stage.length > 0 && <details className="ecard-section ecard-more-verses">
      <summary><h3>{text.stageVerses}</h3><span className="count">{verses.stage.length}</span></summary>
      <ul className="verses is-compact">{verses.stage.map(v => <VerseItem key={v.id} v={v} locale={locale} compact />)}</ul>
    </details>}

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
  // English text appears once the team has filled the _EN column; until then the Arabic is shown, marked as Arabic.
  const enSurah = locale === 'en' && v.surahEn;
  const surahName = locale === 'ar' ? `سورة ${v.surah}` : enSurah ? `Surah ${v.surahEn}` : 'Surah';
  const label = locale === 'en' && v.link?.labelEn ? v.link.labelEn : v.link?.label;
  const labelEn = locale === 'en' && !!v.link?.labelEn;
  const reason = locale === 'en' && v.reasonEn ? v.reasonEn : v.reason;
  const reasonEn = locale === 'en' && !!v.reasonEn;
  return <li className="verse">
    <p className="verse-ref">
      <span className="verse-surah">{surahName}{locale === 'en' && !enSurah && <> <span lang="ar" dir="rtl">{v.surah}</span></>}</span>
      {refs.map(r => <a key={r.url} className="verse-ayat" href={r.url} target="_blank" rel="noreferrer" title={text.readQuranpedia}
        onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setReading(r); }}>
        {v.whole ? text.wholeSurah : r.label}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h4.2c.8 0 .8.6.8.6v9s0-.6-.8-.6H3zM13 3.5H8.8c-.8 0-.8.6-.8.6v9s0-.6.8-.6H13z" fill="none" stroke="currentColor" /></svg>
      </a>)}
    </p>
    {reading && <QuranReader title={surahName} quranRef={reading} locale={locale} onClose={() => setReading(null)} />}
    <p className="verse-title"><PeopleText text={v.title[locale]} lang={v.title[locale] === v.title.ar ? 'ar' : 'en'} /></p>
    <p className="verse-phrase">{v.phrase[locale]}</p>
    {label && v.link?.type !== 'direct' && <p className="verse-label">{labelEn ? label : <Ar>{label}</Ar>}</p>}
    {!compact && <>
      <button type="button" className="verse-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{text.reason}</button>
      {open && <div className="verse-detail">
        {reasonEn ? <p><PeopleText text={reason!} lang="en" /></p>
          : locale === 'en' && v.hadithEn
            // The English version shows the hadith itself, in sunnah.com's published English, with its own narrator line.
            ? <blockquote className="verse-hadith">
                <p className="verse-hadith-chain">{v.hadithEn.chain}:</p>
                <p className="verse-hadith-text"><PeopleText text={v.hadithEn.text} lang="en" /></p>
                <a href={v.hadithEn.url} target="_blank" rel="noreferrer">{v.hadithEn.ref} · sunnah.com ↗</a>
              </blockquote>
            : reason && <Ar as="p"><PeopleText text={reason} lang="ar" /></Ar>}
        {(v.evidence[locale] || v.evidence.ar) && <p className="verse-evidence" lang={v.evidence[locale] ? locale : 'ar'}>{v.evidence[locale] || v.evidence.ar}</p>}
        <p className="verse-refs">
          {hadithLinks(v).map(h => <a key={h.book + h.n} href={h.url} target="_blank" rel="noreferrer">{text[h.book]} {h.n}</a>)}
          {v.tafseer.slice(0, 1).map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{text.tafseer}</a>)}
        </p>
        {v.narrator && <p className="verse-narrator">{text.narrator}: {locale === 'en' && v.narratorEn ? v.narratorEn : <Ar>{v.narrator}</Ar>}</p>}
      </div>}
    </>}
  </li>;
}

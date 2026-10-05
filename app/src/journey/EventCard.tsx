import { useEffect, useState } from 'react';
import { quranpediaRefs, type QuranRef } from '../data/quranpedia';
import { km, pathKm, roundKm } from '../data/geo';
import { dateLine, digits, eventLead, eventPlaceName, hadithLinks, hijri, periodName, peopleFor, versesFor } from '../data/select';
import type { MapArc, QuranEn, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';
import QuranReader from './QuranReader';
import { PeopleText, usePeople } from './People';
import Fold from './Fold';
import EventAudio from './EventAudio';


/** Arabic-only source text keeps its own language and direction inside the English interface. */
const Ar = ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: 'span' | 'p' }) => <Tag lang="ar" dir="rtl">{children}</Tag>;

interface CardProps { data: Sirah; event: SirahEvent; locale: Locale; chapter: number; yearEvents: SirahEvent[]; onPick: (n: number) => void; onWalk?: () => void; walkName?: string;
  /** Story mode: the whole text is shown, not only its opening. */
  full?: boolean;
  /** Whether this is the step the reader is on (a card can stay open after it, on phones). */
  current?: boolean }

export default function EventCard({ data, event, locale, chapter, yearEvents, onPick, onWalk, walkName, full = false, current = true }: CardProps) {
  const text = journeyCopy[locale];
  const [open, setOpen] = useState(full);
  // Story mode opens the whole text; the reader can still fold it again.
  useEffect(() => { if (full) setOpen(true); }, [full]);
  const peopleApi = usePeople();
  const verses = versesFor(data, event);
  const people = peopleFor(data, event);
  const arcs = data.arcs.filter(a => a.event === event.n);
  // The journeys drawn for this event, with their length along the (approximate) route line.
  const routes = data.routes.filter(r => r.kind === 'sirah' && r.events.includes(event.n));
  const body = (locale === 'en' && event.text.en) || event.text.ar;
  const bodyLang = body === event.text.ar ? 'ar' : 'en';
  const title = event.title[locale] || event.title.ar;
  const opening = eventLead(body), rest = body.slice(opening.replace(/…$/, '').length).trim();
  // Opened, an opening cut mid-sentence ("…") runs on to the end of its sentence, and the rest follows as a paragraph.
  const cutAt = opening.replace(/…$/, '').length, sentenceEnd = opening.endsWith('…') ? body.slice(cutAt).search(/[.!؟](\s|$)/) : 0;
  const openLead = sentenceEnd < 0 ? body : body.slice(0, cutAt + sentenceEnd + (opening.endsWith('…') ? 1 : 0)).trim();
  const openRest = body.slice(openLead.length).trim();
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
      {event.place && data.places.has(event.place) && peopleApi?.openPlace
        ? <button type="button" className="ecard-place" aria-haspopup="dialog" onClick={() => peopleApi.openPlace!(event.place!)}>{eventPlaceName(data, event, locale)}</button>
        : <span>{eventPlaceName(data, event, locale) || '—'}</span>}
      {event.precision !== 'exact' && <span className={`prec prec-${event.precision}`}>{text.precision[event.precision]}</span>}
    </p>
    {event.inferred && <p className="ecard-flag">{text.inferred}</p>}

    {locale === 'en' && !event.text.en && <p className="ecard-flag">{text.noEnglish}</p>}
    <div className="ecard-text" lang={bodyLang} dir={bodyLang === 'ar' ? 'rtl' : 'ltr'}>
      <p className="ecard-lead"><PeopleText text={open && rest ? openLead : opening} lang={bodyLang} /></p>
      {open && openRest && <p><PeopleText text={openRest} lang={bodyLang} /></p>}
    </div>
    {rest && <button type="button" className="ecard-more" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? text.readLess : text.readMore}</button>}
    {data.audio.get(event.n) && <EventAudio key={event.n} audio={data.audio.get(event.n)!} locale={locale} current={current} />}
    {onWalk && walkName && <button type="button" className="ecard-walk" onClick={onWalk}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18c3-6 6 2 9-4s5-6 7-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" /><circle cx="4" cy="18" r="2" fill="currentColor" /><circle cx="20" cy="6" r="2" fill="currentColor" /></svg>
      {text.walk(walkName)}
    </button>}
    {routes.map(r => <p key={r.id} className="ecard-distance">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18c3-6 6 2 9-4s5-6 7-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" /><circle cx="4" cy="18" r="2" fill="currentColor" /><circle cx="20" cy="6" r="2" fill="currentColor" /></svg>
      <span>{r.name[locale]} · {/* A symbolic line (the Isra': «مسار رمزي بين المسجدين») is a distance between two places, not a road. */}
        {(r.note.ar.includes('رمزي') ? text.distanceArc : text.distanceRoute)(digits(roundKm(pathKm(r.coords)).toLocaleString('en'), locale))}</span>
    </p>)}
    <p className="ecard-source">{text.source}: <a href={locale === 'en' && event.urlEn ? event.urlEn : event.url} target="_blank" rel="noreferrer">{text.dorar} · {locale === 'ar' ? 'حدث' : 'event'} {event.n}</a></p>

    {people.length > 0 && <section className="ecard-section">
      <h3>{text.people}</h3>
      <ul className="ecard-people">
        {people.map(p => <li key={p.id}><button type="button" aria-haspopup="dialog" onClick={() => peopleApi?.open(p)}>{p.name[locale]}</button></li>)}
      </ul>
    </section>}

    {arcs.length > 0 && <Fold title={arcs.every(a => a.kind === 'letter') ? text.letters : text.delegations} count={digits(arcs.length, locale)}
      preview={arcs.map(a => a.name[locale]).join(locale === 'ar' ? '، ' : ', ')}>
      <ul className="ecard-arcs">{arcs.map(a => <ArcItem key={a.id} a={a} locale={locale} />)}</ul>
    </Fold>}

    {verses.direct.length > 0 && <VerseList title={text.verses} verses={verses.direct} locale={locale} />}
    {verses.context.length > 0 && <VerseList title={text.contextVerses} verses={verses.context} locale={locale} />}
    {verses.stage.length > 0 && <VerseList title={text.stageVerses} verses={verses.stage} locale={locale} compact />}

  </article>;
}

/** A source reference in English: "صحيح البخاري 4386" → "Sahih al-Bukhari 4386". */
const refEn = (s: string) => s.replace(/^الدرر السنية · حدث\s*/, 'Dorar · event ').replace(/صحيح البخاري/, 'Sahih al-Bukhari').replace(/صحيح مسلم/, 'Sahih Muslim');

/** One letter or delegation: who, what came of it, and the source's own words. */
function ArcItem({ a, locale }: { a: MapArc; locale: Locale }) {
  const text = journeyCopy[locale], en = locale === 'en';
  return <li className={`ecard-arc out-${a.outcome}`}>
    <p className="ecard-arc-head"><b>{a.name[locale]}</b><span className="ecard-arc-out">{text.outcome[a.outcome]}</span></p>
    {!en ? <p className="ecard-arc-quote">«{a.quote}»</p>
      : a.quoteEn ? <q className="ecard-arc-quote" lang="en">{a.quoteEn}</q>
      : <><small className="no-translation-note">{text.inArabicQuote}</small><p className="ecard-arc-quote" lang="ar" dir="rtl">«{a.quote}»</p></>}
    <p className="ecard-arc-note">{text.distanceArc(digits(roundKm(km(a.from, a.to)).toLocaleString('en'), locale))}</p>
    {a.note[locale] && <p className="ecard-arc-note">{a.note[locale]}</p>}
    <a className="ecard-arc-source" href={a.url} target="_blank" rel="noreferrer">{en ? refEn(a.source) : a.source}</a>
  </li>;
}

function VerseList({ title, verses, locale, compact = false }: { title: string; verses: Verse[]; locale: Locale; compact?: boolean }) {
  return <Fold title={title} count={digits(verses.length, locale)} preview={versePreview(verses, locale)}>
    <ul className={`verses${compact ? ' is-compact' : ''}`}>{verses.map(v => <VerseItem key={v.id} v={v} locale={locale} compact={compact} />)}</ul>
  </Fold>;
}

/** What a shut verse list holds, in one line: "العلق ١–٥ · المدثر ١–٥". */
function versePreview(verses: Verse[], locale: Locale) {
  const en = locale === 'en', text = journeyCopy[locale];
  return verses.map(v => {
    const surah = en ? v.surahEn ?? v.surah : v.surah;
    const ayat = v.whole ? text.wholeSurah : quranpediaRefs(v.ref, false, locale).map(r => r.label.split(':')[1]).join(en ? ', ' : '، ');
    return `${surah} ${digits(ayat, locale)}`;
  }).join(' · ');
}

/** English text with each Quran quotation (﴿…﴾) shown in a published English translation of its ayah (Quranpedia),
 * with the reference; the Arabic is kept in the tooltip. A quotation with no translation on file stays in Arabic. */
function WithQuran({ text, quran }: { text: string; quran: QuranEn[] }) {
  return <>{text.split(/(﴿[^﴾]*﴾)/).map((part, i) => {
    if (!part.startsWith('﴿')) return <PeopleText key={i} text={part} lang="en" />;
    const t = quran.find(q => q.quote === part.slice(1, -1));
    if (!t) return <span key={i} className="quran-quote" lang="ar" dir="rtl">{part}</span>;
    return <span key={i} className="quran-en"><q lang="en">{t.text}</q>{' '}<a href={t.url} target="_blank" rel="noreferrer" title={t.part ? `${part} — ${t.ayah}` : part}>(Quran {t.ref}{t.part ? ', part' : ''})</a></span>;
  })}</>;
}

/** Arabic shown in the English interface because there is no English for it yet. */
function ArabicOnly({ text, people = false }: { text: string; people?: boolean }) {
  const copy = journeyCopy.en;
  return <div className="no-translation">
    <p className="no-translation-note">{copy.noTranslation}</p>
    <p lang="ar" dir="rtl">{people ? <PeopleText text={text} lang="ar" /> : text}</p>
  </div>;
}

export function VerseItem({ v, locale, compact = false }: { v: Verse; locale: Locale; compact?: boolean }) {
  const text = journeyCopy[locale];
  const en = locale === 'en';
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<QuranRef | null>(null);
  const refs = quranpediaRefs(v.ref, v.whole, locale);
  const surahName = en ? `Surah ${v.surahEn ?? v.surah}` : `سورة ${v.surah}`;
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
    <p className="verse-title"><PeopleText text={v.title[locale]} lang={v.title[locale] === v.title.ar ? 'ar' : 'en'} /></p>
    <p className="verse-phrase">{v.phrase[locale]}</p>
    {label && v.link?.type !== 'direct' && <p className="verse-label">{en && v.link?.labelEn ? v.link.labelEn : <Ar>{label}</Ar>}</p>}
    {!compact && <>
      <button type="button" className="verse-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{text.reason}
        <svg className="fold-chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className={`fold-body verse-fold${open ? ' is-open' : ''}`} inert={!open}><div className="fold-inner"><div className="verse-detail">
        {v.reason && (!en ? <Ar as="p"><PeopleText text={v.reason} lang="ar" /></Ar>
          : v.reasonEn ? <><p><WithQuran text={v.reasonEn} quran={v.quranEn} /></p>
            {v.quranEn.length > 0 && v.reasonEn.includes('﴿') && <p className="quran-credit">{text.quranCredit(v.quranEn[0].translator, v.quranEn.every(q => q.part))}</p>}</>
          : <ArabicOnly text={v.reason} people />)}
        {en && v.hadithEn && <blockquote className="verse-hadith">
          <p className="verse-hadith-label">{text.hadithText}</p>
          <p className="verse-hadith-text">{v.hadithEn.text}</p>
          <a href={v.hadithEn.url} target="_blank" rel="noreferrer">{v.hadithEn.url.replace('https://', '')} ↗</a>
        </blockquote>}
        {(v.evidence[locale] || v.evidence.ar) && <p className="verse-evidence" lang={v.evidence[locale] ? locale : 'ar'}>{en && v.evidence.en ? <WithQuran text={v.evidence.en} quran={v.quranEn} /> : v.evidence[locale] || v.evidence.ar}</p>}
        <p className="verse-refs">
          {hadithLinks(v).map(h => <a key={h.book + h.n} href={h.url} target="_blank" rel="noreferrer">{text[h.book]} {h.n}</a>)}
          {v.tafseer.slice(0, 1).map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{text.tafseer}</a>)}
        </p>
        {v.narrator && <p className="verse-narrator">{text.narrator}: {en && v.narratorEn ? v.narratorEn : <Ar>{v.narrator}</Ar>}</p>}
      </div></div></div>
    </>}
  </li>;
}

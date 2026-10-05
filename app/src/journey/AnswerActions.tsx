import type { ReactNode } from 'react';
import type { AnswerSource } from '../assistant/answer';
import { digits } from '../data/select';
import type { Person } from '../data/types';
import type { Locale } from '../i18n';

const HONORIFIC = /\s*(رضي الله عنهما|رضي الله عنها|رضي الله عنه)\s*/g;
/** A person's name for a button: no honorific, no note in brackets. */
const shortName = (p: Person, locale: Locale) => p.name[locale].replace(HONORIFIC, ' ').replace(/\s*\(.*?\)/g, '').replace(/,.*$/, '').trim();

/**
 * The page a source link points to (al-Raheeq on Shamela: …/book/9820/122), to tell apart sources that share a label —
 * several pages under one heading would otherwise show as identical buttons.
 */
function sourceText(source: AnswerSource, sources: AnswerSource[], locale: Locale) {
  const same = sources.filter(s => s.label === source.label);
  if (same.length < 2) return source.label;
  const page = source.url.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1];
  const which = page ? (locale === 'ar' ? `ص ${digits(page, 'ar')}` : `p. ${page}`) : digits(same.indexOf(source) + 1, locale);
  return `${source.label} (${which})`;
}

export default function AnswerActions({ sources, event, locale, onEvent, person, onPerson, extra }: {
  sources?: AnswerSource[]; event?: number; locale: Locale; onEvent?: (n: number) => void; person?: Person; onPerson?: (p: Person) => void; extra?: ReactNode;
}) {
  return <div className="answer-references">
    {sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{locale === 'ar' ? 'عرض المصدر' : 'View source'} · {sourceText(source, sources, locale)}</a>)}
    {person && onPerson && <button type="button" className="btn-quiet" onClick={() => onPerson(person)}>{locale === 'ar' ? `عرض النبذة: ${shortName(person, 'ar')}` : `About ${shortName(person, 'en')}`}</button>}
    {event !== undefined && onEvent && <button type="button" className="btn-quiet" onClick={() => onEvent(event)}>{locale === 'ar' ? 'عرض الحدث على الخريطة' : 'Show event on map'}</button>}
    {extra}
  </div>;
}

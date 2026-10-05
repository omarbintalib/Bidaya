import type { ReactNode } from 'react';
import type { AnswerSource } from '../assistant/answer';
import type { Locale } from '../i18n';

export default function AnswerActions({ sources, event, locale, onEvent, extra }: { sources?: AnswerSource[]; event?: number; locale: Locale; onEvent?: (n: number) => void; extra?: ReactNode }) {
  return <div className="answer-references">
    {sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{locale === 'ar' ? 'عرض المصدر' : 'View source'} · {source.label}</a>)}
    {event !== undefined && onEvent && <button type="button" className="btn-quiet" onClick={() => onEvent(event)}>{locale === 'ar' ? 'عرض الحدث على الخريطة' : 'Show event on map'}</button>}
    {extra}
  </div>;
}

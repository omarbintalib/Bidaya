import { useEffect, useMemo, useRef, useState } from 'react';
import { answer, answerEvent, askServer, suggestFor, type Answer } from '../assistant/answer';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import AnswerActions from './AnswerActions';
import { journeyCopy } from './copy';

/**
 * "Ask about this moment" inside the Sirah summary: the question goes to the same assistant as the map's Ask, with
 * the moment (its title and quoted passages) as the conversation so far, so "why?" or "who led it?" are understood.
 * The answer shows in the caption and the film waits (onActive); one about another event offers to open it in the story.
 */
export default function SummaryAsk({ data, locale, event, quotes, onActive, onOpenEvent }: {
  data: Sirah; locale: Locale; event: SirahEvent; quotes: string[];
  /** True while the reader is asking or reading an answer: the film pauses. */
  onActive: (active: boolean) => void;
  onOpenEvent: (n: number) => void;
}) {
  const text = journeyCopy[locale];
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<(Answer & { place?: number }) | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  useEffect(() => { onActive(busy || !!reply); }, [busy, reply, onActive]);
  // Questions the sources answer about this moment (worked out only once the reader turns to the field).
  const suggestions = useMemo(() => (focused ? suggestFor(data, event, locale, 2) : []), [focused, data, event, locale]);

  const ask = async (question: string) => {
    const typed = question.trim();
    if (!typed || busy) return;
    setBusy(true); setReply(null); setQ(typed);
    const title = event.title[locale] || event.title.ar;
    const history = [{ question: locale === 'ar' ? `ماذا حدث في: ${title}؟` : `What happened: ${title}?`, answer: quotes.join(' ').slice(0, 1200) }];
    const got = (await askServer(typed, locale, history)) ?? answer(data, typed, locale);
    if (!live.current) return;
    const place = got.kind === 'refusal' || got.kind === 'none' ? undefined : answerEvent(data, got.asked ?? typed, got, locale);
    setReply({ ...got, place });
    setBusy(false);
  };

  return <div className="film-ask">
    <form role="search" aria-label={text.filmAsk} onSubmit={e => { e.preventDefault(); void ask(q); }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={text.filmAsk} aria-label={text.filmAsk} dir="auto"
        onFocus={() => { setFocused(true); onActive(true); }} onBlur={() => { if (!busy && !reply && !q.trim()) onActive(false); }} />
      <button type="submit" disabled={busy || !q.trim()} aria-label={text.ask}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </form>
    {focused && !busy && !reply && suggestions.length > 0 && <ul className="film-ask-suggest">
      {suggestions.map(s => <li key={s}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => void ask(s)}>{s}</button></li>)}
    </ul>}
    {busy && <p className="film-ask-wait" role="status">{text.filmAsking}</p>}
    {reply && <div className="film-ask-answer" role="region" aria-label={text.yourQuestion}>
      <button type="button" className="film-ask-close" aria-label={text.close} onClick={() => { setReply(null); setQ(''); onActive(false); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <p dir="auto">{reply.text}</p>
      <AnswerActions sources={reply.sources} locale={locale} onEvent={onOpenEvent}
        event={reply.place !== undefined && reply.place !== event.n && data.byNumber.has(reply.place) ? reply.place : undefined} />
    </div>}
  </div>;
}

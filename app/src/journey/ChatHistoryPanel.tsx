import { useEffect, useRef, useState } from 'react';
import { normalize } from '../assistant/answer';
import AnswerActions from './AnswerActions';
import type { Locale } from '../i18n';
import type { ChatEntry } from './chatHistory';
import type { Person } from '../data/types';

export const chatCopy = {
  ar: { title: 'المحادثات السابقة', empty: 'لم تبدأ أي محادثة بعد. اسأل الخريطة لتبدأ.', local: 'محفوظة في هذا المتصفح فقط', clear: 'مسح المحادثات', close: 'إغلاق المحادثات', answer: 'الإجابة' },
  en: { title: 'Previous chats', empty: 'No chats yet. Ask the map to begin.', local: 'Saved only in this browser', clear: 'Clear chats', close: 'Close chats', answer: 'Answer' },
};

export default function ChatHistory({ locale, chats, onClear, onClose, onDelete, onEvent, mapEvents, personOf, onPerson }: { locale: Locale; chats: ChatEntry[]; onClear: () => void; onClose: () => void; onDelete: (id: number) => void; onEvent: (n: number) => void; personOf?: (id?: string) => Person | undefined; onPerson?: (p: Person) => void; mapEvents: Set<number> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = chatCopy[locale];
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const ar = locale === 'ar';
  const found = chats.filter(chat => normalize(`${chat.question} ${chat.answer}`).includes(normalize(search).trim()));
  const copyAnswer = async (answer: string) => {
    try { await navigator.clipboard.writeText(answer); setNotice(ar ? 'تم نسخ الإجابة.' : 'Answer copied.'); }
    catch { setNotice(ar ? 'تعذّر النسخ التلقائي. يمكنك تحديد نص الإجابة ونسخه.' : 'Automatic copying is unavailable. Select the answer text to copy it.'); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="chat-history" ref={dialog} aria-labelledby="chat-history-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) { const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><div><h2 id="chat-history-title">{text.title}</h2><p>{text.local}</p></div><button type="button" className="qr-close" onClick={onClose} aria-label={text.close} autoFocus><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button></header>
    <label className="chat-search">{ar ? 'البحث في المحادثات' : 'Search chats'}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <p role="status" className="chat-notice">{notice}</p>
    {chats.length ? <><button className="btn-quiet" onClick={onClear}>{text.clear}</button><ol className="chat-history-list">
      {found.map(chat => <li key={chat.id} lang={chat.locale} dir={chat.locale === 'ar' ? 'rtl' : 'ltr'}>
        {chat.createdAt !== undefined && <time dateTime={new Date(chat.createdAt).toISOString()} lang={locale}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(chat.createdAt)}</time>}
        <h3>{chat.question}</h3><p className="chat-answer">{chat.answer}</p>
        <AnswerActions sources={chat.sources} event={chat.event !== undefined && mapEvents.has(chat.event) ? chat.event : undefined} locale={locale} onEvent={onEvent} person={personOf?.(chat.person)} onPerson={onPerson} />
        <div className="chat-controls" lang={locale}><button className="btn-quiet" onClick={() => void copyAnswer(chat.answer)}>{ar ? 'نسخ الإجابة' : 'Copy answer'}</button><button className="btn-quiet" onClick={() => onDelete(chat.id)}>{ar ? 'حذف المحادثة' : 'Delete chat'}</button></div>
      </li>)}
      {!found.length && <li>{ar ? 'لا توجد محادثات مطابقة.' : 'No matching chats.'}</li>}
    </ol></> : <p className="chat-history-empty">{text.empty}</p>}
  </dialog>;
}

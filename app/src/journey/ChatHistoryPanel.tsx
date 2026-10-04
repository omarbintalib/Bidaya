import { useEffect, useRef } from 'react';
import type { Locale } from '../i18n';
import type { ChatEntry } from './chatHistory';

export const chatCopy = {
  ar: { title: 'المحادثات السابقة', empty: 'لم تبدأ أي محادثة بعد. اسأل الخريطة لتبدأ.', local: 'محفوظة في هذا المتصفح فقط', clear: 'مسح المحادثات', close: 'إغلاق المحادثات', answer: 'الإجابة' },
  en: { title: 'Previous chats', empty: 'No chats yet. Ask the map to begin.', local: 'Saved only in this browser', clear: 'Clear chats', close: 'Close chats', answer: 'Answer' },
};

export default function ChatHistory({ locale, chats, onClear, onClose }: { locale: Locale; chats: ChatEntry[]; onClear: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = chatCopy[locale];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="chat-history" ref={dialog} aria-labelledby="chat-history-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) { const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><div><h2 id="chat-history-title">{text.title}</h2><p>{text.local}</p></div><button type="button" className="qr-close" onClick={onClose} aria-label={text.close} autoFocus><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button></header>
    {chats.length ? <><button className="btn-quiet" onClick={onClear}>{text.clear}</button><ol className="chat-history-list">
      {chats.map(chat => <li key={chat.id} lang={chat.locale} dir={chat.locale === 'ar' ? 'rtl' : 'ltr'}><h3>{chat.question}</h3><p>{chat.answer}</p></li>)}
    </ol></> : <p className="chat-history-empty">{text.empty}</p>}
  </dialog>;
}

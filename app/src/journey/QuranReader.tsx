import { useEffect, useRef } from 'react';
import type { QuranRef } from '../data/quranpedia';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

/** Shows a Quranpedia reader page in a modal dialog, with a link to open it on Quranpedia directly. */
export default function QuranReader({ title, quranRef, locale, onClose }: { title: string; quranRef: QuranRef; locale: Locale; onClose: () => void }) {
  const text = journeyCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);

  return <dialog ref={dialog} className="quran-reader" aria-label={title} onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="qr-box">
      <header className="qr-head">
        <h2>{title} <span className="qr-ref">{quranRef.label}</span></h2>
        <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </header>
      <iframe className="qr-frame" src={quranRef.url} title={`${title} ${quranRef.label} — Quranpedia`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      <footer className="qr-foot">
        <span>{text.quranpediaNote}</span>
        <a href={quranRef.url} target="_blank" rel="noreferrer">{text.openQuranpedia} ↗</a>
      </footer>
    </div>
  </dialog>;
}

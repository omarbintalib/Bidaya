import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { search, type SearchResult } from '../data/search';
import type { Sirah } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

/** Search the Sirah: events, people, places and verses, as the reader types. Arrow keys move, Enter opens. */
export default function Search({ data, locale, onClose, onPick }: { data: Sirah; locale: Locale; onClose: () => void; onPick: (r: SearchResult) => void }) {
  const text = journeyCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal?.(); input.current?.focus(); }, []);
  const results = useMemo(() => search(data, q, locale), [data, q, locale]);
  useEffect(() => setAt(0), [q]);
  const pick = (r: SearchResult) => { onPick(r); onClose(); };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setAt(i => Math.min(results.length - 1, i + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (ev.key === 'Enter' && results[at]) { ev.preventDefault(); pick(results[at]); }
  };
  return <dialog ref={dialog} className="search-dialog" aria-label={text.searchTitle} onClose={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="search-field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder={text.searchPlaceholder} aria-label={text.searchTitle}
        role="combobox" aria-expanded={results.length > 0} aria-controls="search-results" aria-activedescendant={results[at] ? `sr-${at}` : undefined} />
      <button type="button" className="qr-close" onClick={onClose} aria-label={text.close}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" /></svg></button>
    </div>
    {q.trim().length < 2 ? <p className="search-hint">{text.searchHint}</p>
      : results.length === 0 ? <p className="search-hint">{text.searchEmpty}</p>
      : <ul id="search-results" className="search-results" role="listbox">
        {results.map((r, i) => <li key={`${r.kind}-${r.id}`} id={`sr-${i}`} role="option" aria-selected={i === at}>
          <button type="button" className={i === at ? 'is-on' : ''} onMouseEnter={() => setAt(i)} onClick={() => pick(r)}>
            <span className={`search-kind is-${r.kind}`}>{text.searchKinds[r.kind]}</span>
            <span className="search-title">{r.title}</span>
            {r.sub && <small>{r.sub}</small>}
          </button>
        </li>)}
      </ul>}
  </dialog>;
}

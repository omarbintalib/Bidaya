import { useId, useState, type ReactNode } from 'react';

/**
 * A section that folds shut: a heading row with a count, a one-line preview of what is inside while shut,
 * and a chevron. The body slides open; while shut it is out of the tab order and hidden from screen readers.
 */
export default function Fold({ title, count, preview, defaultOpen = false, className = '', children }: {
  title: ReactNode; count?: ReactNode; preview?: ReactNode; defaultOpen?: boolean; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <section className={`fold${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
    <h3 className="fold-head">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="fold-title">{title}</span>
        {count !== undefined && <span className="count">{count}</span>}
        <svg className="fold-chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </h3>
    {preview && <p className="fold-preview" aria-hidden={open}>{preview}</p>}
    <div className="fold-body" id={id} inert={!open}>
      <div className="fold-inner">{children}</div>
    </div>
  </section>;
}

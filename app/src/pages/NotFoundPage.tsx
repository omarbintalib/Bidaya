import type { MouseEvent } from 'react';
import type { Locale } from '../i18n';
import { recoveryCopy } from '../components/Recovery';

export default function NotFoundPage({ locale, onHome, onBegin }: { locale: Locale; onHome: () => void; onBegin: () => void }) {
  const text = recoveryCopy[locale];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, action: () => void) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); action();
  };
  return <main className="explorer recovery-page"><section className="recovery-panel">
    <p className="eyebrow">404</p><h1 data-page-heading tabIndex={-1}>{text.missing}</h1><p>{text.missingBody}</p>
    <div className="recovery-actions"><a href="/" onClick={event => navigate(event, onHome)}>{text.home}</a><a href="/journey" onClick={event => navigate(event, onBegin)}>{text.begin}</a></div>
  </section></main>;
}

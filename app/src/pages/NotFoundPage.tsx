import type { MouseEvent } from 'react';
import type { Locale } from '../i18n';
import { recoveryCopy } from '../components/Recovery';

export default function NotFoundPage({ locale, onHome, onBegin }: { locale: Locale; onHome: () => void; onBegin: () => void }) {
  const text = recoveryCopy[locale];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, action: () => void) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); action();
  };
  return <main id="main-content" tabIndex={-1} className="explorer recovery-page not-found-page"><section className="not-found-content">
    <span className="not-found-number" aria-hidden="true">404</span><p className="eyebrow">{locale === 'ar' ? 'خطأ 404' : 'Error 404'}</p><h1 data-page-heading tabIndex={-1}>{text.missing}</h1><p>{text.missingBody}</p>
    <div className="recovery-actions"><a href="/" onClick={event => navigate(event, onHome)}>{text.home}</a><a href="/journey" onClick={event => navigate(event, onBegin)}>{text.begin}</a></div>
  </section></main>;
}

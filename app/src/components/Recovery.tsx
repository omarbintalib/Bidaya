import { Component, type ReactNode } from 'react';
import type { Locale } from '../i18n';

export const recoveryCopy = {
  ar: { title: 'لنواصل الحكاية', body: 'تعذّر فتح هذه المساحة الآن. يمكنك المحاولة مجددًا أو العودة إلى البداية.', retry: 'حاول مجددًا', reload: 'إعادة تحميل الصفحة', home: 'العودة إلى البداية', missing: 'الصفحة غير موجودة', missingBody: 'ربما تغيّر الرابط. اختر البداية أو ابدأ الرحلة من هنا.', begin: 'ابدأ الرحلة', preview: 'يمكنك استكشاف هذا المشهد داخل الرحلة.' },
  en: { title: 'Let’s continue the story', body: 'This space is temporarily unavailable. Try again or return to the beginning.', retry: 'Try again', reload: 'Reload page', home: 'Back to the beginning', missing: 'Page not found', missingBody: 'The link may have changed. Return to the beginning or start your journey here.', begin: 'Start Journey', preview: 'Explore this scene inside the Journey.' },
};

export function Recovery({ locale, onRetry }: { locale: Locale; onRetry?: () => void }) {
  const text = recoveryCopy[locale];
  return <section className="recovery-panel" aria-labelledby="recovery-title" role="status">
    <h2 id="recovery-title" tabIndex={-1}>{text.title}</h2><p>{text.body}</p>
    <div className="recovery-actions">{onRetry && <button className="btn-primary" onClick={onRetry}>{text.retry}</button>}
      <button className="btn-quiet" onClick={() => window.location.reload()}>{text.reload}</button><a href="/">{text.home}</a></div>
  </section>;
}

export class PageBoundary extends Component<{ locale: Locale; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main id="main-content" tabIndex={-1} className="explorer"><Recovery locale={this.props.locale} onRetry={() => this.setState({ failed: false })} /></main> : this.props.children; }
}

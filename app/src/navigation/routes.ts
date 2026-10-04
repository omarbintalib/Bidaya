import type { Locale } from '../i18n';

export type PageId = 'home' | 'journey' | 'not-found';
export const routes = [
  { id: 'home', path: '/', number: '01', ar: { title: 'البداية', subtitle: 'هنا تبدأ الحكاية' }, en: { title: 'The beginning', subtitle: 'Every story starts somewhere' } },
  { id: 'journey', path: '/journey', number: '02', ar: { title: 'رحلة الإسلام', subtitle: 'عبر المكان والزمان' }, en: { title: 'Islam Journey', subtitle: 'Across place and time' } },
] as const;

const notFound = { id: 'not-found', path: '/404', number: '404', ar: { title: 'الصفحة غير موجودة', subtitle: 'لنعد إلى بداية الحكاية' }, en: { title: 'Page not found', subtitle: 'Let’s return to the beginning' } } as const;
export const routeFor = (id: PageId) => id === 'not-found' ? notFound : routes.find(route => route.id === id)!;
/** Paths that used to be pages, now part of another one. */
export const MOVED: Record<string, string> = { '/spread': '/journey' };
export function pageFromPath(path: string): PageId {
  const clean = path.replace(/\/$/, '') || '/';
  return routes.find(route => route.path === (MOVED[clean] ?? clean))?.id ?? 'not-found';
}
export const navigationCopy: Record<Locale, { choose: string; open: string; close: string; chapter: string; loading: string; explore: string; footnote: string }> = {
  ar: { choose: 'اختر وجهتك', open: 'اختر وجهتك — فتح قائمة الصفحات', close: 'إغلاق قائمة الوجهات', chapter: 'الفصل', loading: 'ننتقل إلى وجهتك', explore: 'اكتشف الوجهات', footnote: 'وجهتان، وحكاية واحدة' },
  en: { choose: 'Choose your destination', open: 'Choose your destination — open page menu', close: 'Close destinations', chapter: 'CHAPTER', loading: 'Opening your destination', explore: 'Explore the destinations', footnote: 'Two destinations. One story.' },
};

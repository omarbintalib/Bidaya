import type { Locale } from '../i18n';

export type PageId = 'home' | 'spread' | 'journey';
export const routes = [
  { id: 'home', path: '/', number: '01', ar: { title: 'البداية', subtitle: 'هنا تبدأ الحكاية' }, en: { title: 'The beginning', subtitle: 'Every story starts somewhere' } },
  { id: 'spread', path: '/spread', number: '02', ar: { title: 'انتشار الإسلام', subtitle: 'أثرٌ يمتد عبر الآفاق' }, en: { title: 'Spread of Islam', subtitle: 'A story across horizons' } },
  { id: 'journey', path: '/journey', number: '03', ar: { title: 'رحلة الإسلام', subtitle: 'عبر المكان والزمان' }, en: { title: 'Islam Journey', subtitle: 'Across place and time' } },
] as const;

export const routeFor = (id: PageId) => routes.find(route => route.id === id)!;
export function pageFromPath(path: string): PageId {
  return routes.find(route => route.path === (path.replace(/\/$/, '') || '/'))?.id ?? 'home';
}
export const navigationCopy: Record<Locale, { choose: string; open: string; close: string; chapter: string; loading: string; explore: string }> = {
  ar: { choose: 'اختر وجهتك', open: 'اختر وجهتك — فتح قائمة الصفحات', close: 'إغلاق قائمة الوجهات', chapter: 'الفصل', loading: 'ننتقل إلى وجهتك', explore: 'اكتشف الوجهات' },
  en: { choose: 'Choose your destination', open: 'Choose your destination — open page menu', close: 'Close destinations', chapter: 'CHAPTER', loading: 'Opening your destination', explore: 'Explore the destinations' },
};

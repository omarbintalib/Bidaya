import type { Locale } from '../i18n';

export const mapCopy: Record<Locale, Record<'label' | 'zoomIn' | 'zoomOut' | 'reset' | 'north' | 'legend' | 'selected' | 'stage' | 'past' | 'approx' | 'route' | 'trade' | 'noPin', string>> = {
  ar: {
    label: 'خريطة جزيرة العرب في عهد النبوة',
    zoomIn: 'تكبير', zoomOut: 'تصغير', reset: 'العودة إلى الحجاز', north: 'ش',
    legend: 'دليل الخريطة', selected: 'الحدث المختار', stage: 'أحداث المرحلة', past: 'أحداث سابقة',
    approx: 'موضع تقريبي', route: 'مسار تقريبي', trade: 'طرق القوافل',
    noPin: 'لا يُعرف موضع هذا الحدث على الخريطة، فيبقى على الخط الزمني فقط.',
  },
  en: {
    label: 'Map of Arabia in the time of the Prophet ﷺ',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Back to the Hijaz', north: 'N',
    legend: 'Map key', selected: 'Selected event', stage: 'Events in this stage', past: 'Earlier events',
    approx: 'Approximate location', route: 'Approximate route', trade: 'Caravan routes',
    noPin: 'The location of this event is not known, so it appears on the timeline only.',
  },
};

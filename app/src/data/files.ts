import { parseCsv } from './csv';

/** The data files the app reads, at the repository root (served at /data/). */
export const FILES = {
  events: '2_sirah_events.csv',
  texts: '12_dorar_titles_and_texts_ar_en.csv',
  places: '4_places.csv',
  verses: '1_related_surahs.csv',
  links: '3_links_surahs_sirah.csv',
  people: '6_sahaba.csv',
  routes: '5_sirah_map.geojson',
  labels: 'map_labels.csv',
  trade: 'map_routes.csv',
  stops: 'route_stops.csv',
  quiz: 'quiz.csv',
  facts: '7_sahaba_references.csv',
  arcs: 'map_arcs.csv',
  quranEn: 'quran_en.csv',
  growth: 'islam_growth.csv',
} as const;

/**
 * The columns load.ts reads from the larger files. `npm run build` publishes only these, which cuts the data
 * download by about a third (the review notes, verification columns and the Arabic copy of the texts stay in the
 * repository). The smaller files are published whole. A test checks the trimmed files load exactly like the full ones:
 * if it fails after load.ts starts reading a new column, add the column here.
 */
const COLUMNS: Partial<Record<string, string[]>> = {
  [FILES.events]: ['ترتيب_العرض', 'dorar_event_number', 'dorar_url', 'العنوان_في_الدرر', 'الفترة', 'السنة_الهجرية', 'الشهر_الهجري', 'السنة_الميلادية', 'رمز_المكان', 'المكان', 'Place_EN', 'lat', 'lon', 'دقة_الموقع', 'أساس_التحديد', 'النص'],
  [FILES.texts]: ['dorar_event_number', 'title_en_display', 'رابط_الدرر_الإنجليزي', 'text_en_dorar'],
  [FILES.verses]: ['المعرف', 'المرحلة', 'الحدث', 'العنوان_EN', 'السورة', 'السورة_EN', 'الآيات', 'مرجع_الآيات', 'روابط_المصحف', 'صحيح_البخاري', 'صحيح_مسلم', 'الراوي', 'الراوي_EN', 'وجه_الارتباط', 'وجه_الارتباط_EN', 'نص_الحديث_EN', 'رابط_نص_الحديث_EN', 'نوع_الارتباط', 'صيغة_العرض', 'صيغة_العرض_EN', 'نطاق_السورة', 'الدليل', 'الدليل_EN', 'روابط_موسوعة_التفسير'],
  [FILES.links]: ['المعرف', 'نوع_الربط', 'رقم_حدث_الدرر', 'الموضع_في_الخط_الزمني', 'سبب_الموضع', 'النطاق_من', 'النطاق_إلى', 'نص_الربط_في_الواجهة', 'نص_الربط_في_الواجهة_EN'],
  [FILES.people]: ['معرف_الصحابي', 'الاسم', 'Name_EN', 'النوع', 'النوع_EN', 'نبذة_موثقة', 'نبذة_موثقة_EN', 'الوفاة_أو_الاستشهاد', 'الوفاة_أو_الاستشهاد_EN', 'أحداث_الدرر_المرتبطة', 'أسباب_النزول_المرتبطة', 'الفئة', 'وقت_الإسلام', 'وقت_الإسلام_EN', 'أسماء_أخرى', 'Aliases_EN'],
  [FILES.facts]: ['معرف_الحقيقة', 'معرف_الصحابي', 'الحقيقة', 'الحقيقة_EN', 'المرجع', 'معرف_المصدر_في_المشروع', 'الرابط', 'الشاهد_من_المصدر', 'الشاهد_من_المصدر_EN'],
};

const cell = (v: string) => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** The published copy of a data file: only what the app reads (see COLUMNS), and for the map layer only the routes. */
export function trimData(name: string, text: string): string {
  if (name === FILES.routes) {
    const geo = JSON.parse(text) as { features: { properties: Record<string, unknown> }[] };
    return JSON.stringify({ ...geo, features: geo.features.filter(f => f.properties.kind === 'route') });
  }
  const keep = COLUMNS[name];
  if (!keep) return text;
  const rows = parseCsv(text);
  const header = keep.filter(c => rows.length === 0 || c in rows[0]);
  return '﻿' + [header, ...rows.map(r => header.map(c => r[c]))].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

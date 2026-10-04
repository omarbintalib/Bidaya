import { parseCsv } from './csv';
import type { LinkType, MapLabel, Period, Person, Place, Precision, QuizQuestion, Route, RouteStop, Sirah, SirahEvent, Verse, VerseLink } from './types';

/**
 * Everything the interface shows is read at runtime from the CSVs at the repository root (served at /data/).
 * Edit a CSV (Excel is fine — keep UTF-8 and the header row), save, and reload the page.
 */
export const DATA_DIR = `${import.meta.env.BASE_URL}data/`;

const FILES = {
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
} as const;

const PERIODS: Record<string, Period> = { 'قبل البعثة': 'prologue', 'العهد المكي': 'makkah', 'الهجرة': 'hijrah', 'العهد المدني': 'madinah' };
const PRECISION: Record<string, Precision> = { 'دقيق': 'exact', 'تقريبي': 'approx', 'منطقة': 'region', 'غير محدد': 'none' };
const LINK_TYPES: Record<string, LinkType> = { 'مباشر': 'direct', 'سياق': 'context', 'موضع مقترح': 'suggested', 'بعد الحدث': 'after', 'مرحلة': 'stage', 'عنصر نائب': 'placeholder' };
const LABEL_KINDS: Record<string, MapLabel['kind']> = { 'إقليم': 'region', 'قوة': 'power', 'بحر': 'sea' };
const SIZES: Record<string, MapLabel['size']> = { 'كبير': 'l', 'متوسط': 'm', 'صغير': 's' };
const ROUTE_EN: Record<string, string> = { 'الهجرة النبوية': 'The Hijrah', 'الإسراء': "The Isra'", 'الخروج إلى الطائف': 'The journey to Taif', 'غزوة تبوك': 'The expedition to Tabuk', 'حجة الوداع': 'The Farewell Hajj' };

const num = (v: string | undefined) => { const s = (v ?? '').trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const list = (v: string | undefined) => (v ?? '').split(/[،,|]/).map(s => s.trim()).filter(s => s && s !== '—');

async function fetchText(name: string) {
  const res = await fetch(DATA_DIR + encodeURIComponent(name), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

export async function loadSirah(): Promise<Sirah> {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, name]) => [key, await fetchText(name)] as const));
  const raw = Object.fromEntries(entries) as Record<keyof typeof FILES, string>;
  const warn = (msg: string) => console.warn(`[data] ${msg}`);

  const places = new Map<string, Place>();
  for (const r of parseCsv(raw.places)) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) { warn(`4_places.csv: "${r['رمز_المكان']}" has no coordinates`); continue; }
    places.set(r['رمز_المكان'], { key: r['رمز_المكان'], name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, lat, lon, kind: r['النوع'], confirmed: r['دقة_الإحداثيات'] === 'مؤكد', events: num(r['عدد_الأحداث']) ?? 0, reached: num(r['حدث_بلوغ_الإسلام']) });
  }

  const texts = new Map(parseCsv(raw.texts).map(r => [num(r.dorar_event_number), r]));
  const events: SirahEvent[] = [];
  for (const r of parseCsv(raw.events)) {
    const n = num(r.dorar_event_number), order = num(r['ترتيب_العرض']);
    if (n === null || order === null) { warn(`2_sirah_events.csv: a row is missing dorar_event_number or ترتيب_العرض`); continue; }
    const t = texts.get(n);
    const place = r['رمز_المكان'] || null;
    if (place && !places.has(place)) warn(`event ${n}: place "${place}" is not in 4_places.csv`);
    events.push({
      n, order,
      period: PERIODS[r['الفترة']] ?? 'madinah',
      year: num(r['السنة_الهجرية']),
      month: r['الشهر_الهجري'] || null,
      ce: num(r['السنة_الميلادية']),
      place,
      placeName: { ar: r['المكان'], en: r.Place_EN || r['المكان'] },
      lat: num(r.lat), lon: num(r.lon),
      precision: PRECISION[r['دقة_الموقع']] ?? 'none',
      inferred: r['أساس_التحديد'] === 'استنتاج',
      title: { ar: r['العنوان_في_الدرر'].replace(/\s*\.\s*$/, ''), en: t?.title_en_display || '' },
      text: { ar: r['النص'], en: t?.text_en_dorar || '' },
      url: r.dorar_url || `https://dorar.net/history/event/${n}`,
      urlEn: t?.['رابط_الدرر_الإنجليزي'] || null,
    });
  }
  events.sort((a, b) => a.order - b.order);
  const byNumber = new Map(events.map(e => [e.n, e]));

  const links = new Map<string, VerseLink>();
  for (const r of parseCsv(raw.links)) {
    const event = num(r['رقم_حدث_الدرر']);
    if (event !== null && !byNumber.has(event)) warn(`3_links_surahs_sirah.csv: ${r['المعرف']} points to missing event ${event}`);
    links.set(r['المعرف'], {
      type: LINK_TYPES[r['نوع_الربط']] ?? 'placeholder', event,
      at: num(r['الموضع_في_الخط_الزمني']), from: num(r['النطاق_من']), to: num(r['النطاق_إلى']),
      label: r['نص_الربط_في_الواجهة'] || null, reason: r['سبب_الموضع'] || null,
    });
  }

  const verses: Verse[] = parseCsv(raw.verses).map(r => ({
    id: r['المعرف'],
    title: { ar: r['الحدث'], en: r['العنوان_EN'] || r['الحدث'] },
    stage: r['المرحلة'],
    surah: r['السورة'], ref: r['مرجع_الآيات'], ayat: r['الآيات'],
    mushaf: list(r['روابط_المصحف']), bukhari: list(r['صحيح_البخاري']), muslim: list(r['صحيح_مسلم']),
    narrator: r['الراوي'] || null,
    reason: r['وجه_الارتباط'], kind: r['نوع_الارتباط'],
    phrase: { ar: r['صيغة_العرض'], en: r['صيغة_العرض_EN'] || r['صيغة_العرض'] },
    whole: r['نطاق_السورة'] === 'السورة كاملة',
    evidence: { ar: r['الدليل'], en: r['الدليل_EN'] },
    tafseer: list(r['روابط_موسوعة_التفسير']),
    link: links.get(r['المعرف']) ?? null,
  }));

  const stated = (v: string | undefined) => v && !/غير مذكور/.test(v) ? v : null;
  const aliasList = (ar = '', en = '') => {
    const a = ar.split('؛').map(s => s.trim()).filter(Boolean), e = en.split(';').map(s => s.trim()).filter(Boolean);
    return Array.from({ length: Math.max(a.length, e.length) }, (_, i) => ({ ar: a[i] ?? '', en: e[i] ?? '' }));
  };
  const people: Person[] = parseCsv(raw.people).map(r => ({
    id: r['معرف_الصحابي'],
    name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] },
    kind: r['النوع'],
    category: r['الفئة'] || 'الصحابة',
    bio: r['نبذة_موثقة'],
    islam: stated(r['وقت_الإسلام']),
    death: stated(r['الوفاة_أو_الاستشهاد']),
    aliases: aliasList(r['أسماء_أخرى'], r.Aliases_EN),
    events: list(r['أحداث_الدرر_المرتبطة']).map(Number).filter(Number.isFinite),
    verses: list(r['أسباب_النزول_المرتبطة']),
  }));

  const routes: Route[] = [];
  const geo = JSON.parse(raw.routes) as { features: { properties: Record<string, string>; geometry: { coordinates: [number, number][] } }[] };
  for (const f of geo.features) {
    const p = f.properties;
    if (p.kind !== 'route') continue;
    routes.push({
      id: p.ref, kind: 'sirah',
      name: { ar: p.name, en: ROUTE_EN[p.name] ?? p.name },
      events: (p.ref.match(/\d+/g) ?? []).map(Number),
      note: { ar: p.note, en: 'Approximate path' },
      coords: f.geometry.coordinates,
    });
  }
  for (const r of parseCsv(raw.trade)) {
    const coords = r['النقاط'].split(';').map(pt => pt.trim().split(/\s+/).map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite)).map(([lat, lon]) => [lon, lat] as [number, number]);
    if (coords.length < 2) { warn(`map_routes.csv: "${r['المعرف']}" needs at least two points ("lat lon; lat lon")`); continue; }
    routes.push({ id: r['المعرف'], kind: 'trade', name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, events: [], note: { ar: r['ملاحظة'], en: r.Note_EN || r['ملاحظة'] }, coords });
  }

  const labels: MapLabel[] = [];
  for (const r of parseCsv(raw.labels)) {
    const lat = num(r.lat), lon = num(r.lon), kind = LABEL_KINDS[r['النوع']];
    if (lat === null || lon === null || !kind) { warn(`map_labels.csv: "${r['المعرف']}" needs lat, lon and النوع (إقليم / قوة / بحر)`); continue; }
    labels.push({ id: r['المعرف'], kind, name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, lat, lon, size: SIZES[r['الحجم']] ?? 'm', rotate: num(r['الدوران']) ?? 0, note: r['ملاحظة'], reached: num(r['حدث_بلوغ_الإسلام']), reachNote: r['ملاحظة_بلوغ_الإسلام'] ?? '' });
  }

  const stops = new Map<string, RouteStop[]>();
  for (const r of parseCsv(raw.stops).sort((a, b) => (num(a['الترتيب']) ?? 0) - (num(b['الترتيب']) ?? 0))) {
    const lat = num(r.lat), lon = num(r.lon), event = num(r['رقم_حدث_الدرر']);
    if (lat === null || lon === null || event === null) { warn(`route_stops.csv: a stop of "${r['المسار']}" needs lat, lon and رقم_حدث_الدرر`); continue; }
    if (!routes.some(x => x.id === r['المسار'])) warn(`route_stops.csv: route "${r['المسار']}" is not in 5_sirah_map.geojson`);
    const list = stops.get(r['المسار']) ?? [];
    list.push({ name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, lat, lon, event, quote: r['الشاهد'], url: r['رابط_الدرر'] || `https://dorar.net/history/event/${event}` });
    stops.set(r['المسار'], list);
  }

  const quiz: QuizQuestion[] = [];
  for (const r of parseCsv(raw.quiz)) {
    const period = PERIODS[r['الفصل']], event = num(r['رقم_حدث_الدرر']);
    const options = r['الخيارات'].split(';').map(s => s.trim()).filter(Boolean);
    const missing = [r['الإجابة'], ...options].filter(k => !places.has(k));
    if (!period || event === null || missing.length || !options.includes(r['الإجابة'])) { warn(`quiz.csv: "${r['المعرف']}" needs a valid الفصل, رقم_حدث_الدرر, and places from 4_places.csv (missing: ${missing.join(', ') || 'none'})`); continue; }
    quiz.push({ id: r['المعرف'], period, question: { ar: r['السؤال'], en: r.Question_EN || r['السؤال'] }, answer: r['الإجابة'], options,
      explanation: { ar: r['الشرح'], en: r.Explanation_EN || r['الشرح'] }, event, quote: r['الشاهد'], url: r['رابط_الدرر'] || `https://dorar.net/history/event/${event}` });
  }

  return { events, byNumber, places, verses, people, routes, labels, stops, quiz };
}

let cache: Promise<Sirah> | null = null;
export function getSirah() {
  cache ??= loadSirah().catch(error => { cache = null; throw error; });
  return cache;
}

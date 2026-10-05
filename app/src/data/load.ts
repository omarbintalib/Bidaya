import { parseCsv } from './csv';
import { FILES } from './files';
import type { EventAudio, EventSound, Growth, LinkType, MapArc, MapLabel, Period, Person, Place, Precision, QuizQuestion, Route, RouteStop, Sirah, SirahEvent, SoundKind, Verse, VerseLink } from './types';

/**
 * Everything the interface shows is read at runtime from the CSVs at the repository root (served at /data/).
 * Edit a CSV (Excel is fine — keep UTF-8 and the header row), save, and reload the page.
 */
export const DATA_DIR = `${import.meta.env.BASE_URL}data/`;

const PERIODS: Record<string, Period> = { 'قبل البعثة': 'prologue', 'العهد المكي': 'makkah', 'الهجرة': 'hijrah', 'العهد المدني': 'madinah' };
const PRECISION: Record<string, Precision> = { 'دقيق': 'exact', 'تقريبي': 'approx', 'منطقة': 'region', 'غير محدد': 'none' };
const LINK_TYPES: Record<string, LinkType> = { 'مباشر': 'direct', 'سياق': 'context', 'موضع مقترح': 'suggested', 'بعد الحدث': 'after', 'مرحلة': 'stage', 'عنصر نائب': 'placeholder' };
const LABEL_KINDS: Record<string, MapLabel['kind']> = { 'إقليم': 'region', 'قوة': 'power', 'بحر': 'sea' };
const ARC_KINDS: Record<string, MapArc['kind']> = { 'رسالة': 'letter', 'وفد': 'delegation' };
const OUTCOMES: Record<string, MapArc['outcome']> = { 'أسلم': 'accepted', 'لم يسلم': 'declined', 'أكرم الكتاب': 'honoured', 'صلح': 'treaty' };
const SIZES: Record<string, MapLabel['size']> = { 'كبير': 'l', 'متوسط': 'm', 'صغير': 's' };
const ROUTE_EN: Record<string, string> = { 'الهجرة النبوية': 'The Hijrah', 'الإسراء': "The Isra'", 'الخروج إلى الطائف': "The journey to Ta'if", 'غزوة تبوك': 'The expedition to Tabuk', 'حجة الوداع': 'The Farewell Hajj', 'الهجرة إلى الحبشة': 'The Hijrah to Abyssinia', 'هجرة أبي موسى الأشعري وأصحابه مرورا بالحبشة': "Abu Musa's Hijrah by way of Abyssinia", 'سفر النبي ﷺ مع عمه أبي طالب إلى الشام': 'The journey to al-Sham with Abu Talib', 'سفر النبي ﷺ للمرة الثانية إلى الشام': 'The second journey to al-Sham', 'رحلة آمنة بالنبي ﷺ إلى المدينة': "Aminah's journey to Madinah", 'الخروج إلى بدر': 'The march to Badr', 'الخروج إلى الحديبية': 'The journey to al-Hudaybiyah', 'الخروج إلى خيبر': 'The march to Khaybar', 'جيش مؤتة': "The army of Mu'tah", 'المسير إلى فتح مكة': 'The march to the Conquest of Makkah', 'حنين والطائف': "Hunayn and Ta'if" };

const num = (v: string | undefined) => { const s = (v ?? '').trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const list = (v: string | undefined) => (v ?? '').split(/[،,|]/).map(s => s.trim()).filter(s => s && s !== '—');

async function fetchText(name: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(DATA_DIR + encodeURIComponent(name), { cache: 'no-cache', signal: controller.signal });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timeout); }
}

export async function loadSirah(): Promise<Sirah> {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, name]) => [key, await fetchText(name)] as const));
  const raw = Object.fromEntries(entries) as Record<keyof typeof FILES, string>;
  const warn = (msg: string) => console.warn(`[data] ${msg}`);

  const places = new Map<string, Place>();
  for (const r of parseCsv(raw.places)) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) { warn(`4_places.csv: "${r['رمز_المكان']}" has no coordinates`); continue; }
    places.set(r['رمز_المكان'], { key: r['رمز_المكان'], name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, lat, lon, kind: r['النوع'], confirmed: r['دقة_الإحداثيات'] === 'مؤكد', events: num(r['عدد_الأحداث']) ?? 0, reached: num(r['حدث_بلوغ_الإسلام']),
      nameBefore: r['الاسم_قبل'] ? { ar: r['الاسم_قبل'], en: r.Name_Before_EN || r['الاسم_قبل'] } : null, renamedAt: num(r['حدث_الاسم']),
      nameNote: r['ملاحظة_الاسم'] ? { ar: r['ملاحظة_الاسم'], en: r.Name_Note_EN || r['ملاحظة_الاسم'] } : null, reachQuote: r['شاهد_بلوغ_الإسلام'] || null });
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
      label: r['نص_الربط_في_الواجهة'] || null, labelEn: r['نص_الربط_في_الواجهة_EN'] || null, reason: r['سبب_الموضع'] || null,
    });
  }

  // ﷺ is a right-to-left character: in English, a number or dash after it would be pulled into right-to-left order
  // ("ﷺ — 13 BH" shows as "13 — ﷺ BH"). A left-to-right mark after it keeps the English in order.
  const en = (s: string | undefined) => s ? s.replace(/ﷺ(?!\u200E)/g, 'ﷺ\u200E') : null;
  const quranEn = new Map<string, Verse['quranEn']>();
  for (const r of parseCsv(raw.quranEn)) {
    const list = quranEn.get(r['المعرف']) ?? [];
    list.push({ quote: r['الاقتباس'], ref: r['الآيات'], text: r['Translation_EN'], ayah: r['Ayah_EN'] || r['Translation_EN'], part: !!r['الجزء'], translator: r['المترجم'], url: r['الرابط'] });
    quranEn.set(r['المعرف'], list);
  }
  const verses: Verse[] = parseCsv(raw.verses).map(r => ({
    id: r['المعرف'],
    title: { ar: r['الحدث'], en: r['العنوان_EN'] || r['الحدث'] },
    stage: r['المرحلة'],
    surah: r['السورة'], surahEn: r['السورة_EN'] || null, ref: r['مرجع_الآيات'], ayat: r['الآيات'],
    mushaf: list(r['روابط_المصحف']), bukhari: list(r['صحيح_البخاري']), muslim: list(r['صحيح_مسلم']),
    narrator: r['الراوي'] || null, narratorEn: en(r['الراوي_EN']),
    reason: r['وجه_الارتباط'], reasonEn: en(r['وجه_الارتباط_EN']), kind: r['نوع_الارتباط'],
    hadithEn: r['نص_الحديث_EN'] && r['رابط_نص_الحديث_EN'] ? { text: en(r['نص_الحديث_EN'])!, url: r['رابط_نص_الحديث_EN'] } : null,
    phrase: { ar: r['صيغة_العرض'], en: en(r['صيغة_العرض_EN']) ?? r['صيغة_العرض'] },
    whole: r['نطاق_السورة'] === 'السورة كاملة',
    evidence: { ar: r['الدليل'], en: r['الدليل_EN'] },
    tafseer: list(r['روابط_موسوعة_التفسير']),
    link: links.get(r['المعرف']) ?? null,
    quranEn: quranEn.get(r['المعرف']) ?? [],
  }));

  const stated = (v: string | undefined) => v && !/غير مذكور/.test(v) ? v : null;
  const aliasList = (ar = '', en = '') => {
    const a = ar.split('؛').map(s => s.trim()).filter(Boolean), e = en.split(';').map(s => s.trim()).filter(Boolean);
    return Array.from({ length: Math.max(a.length, e.length) }, (_, i) => ({ ar: a[i] ?? '', en: e[i] ?? '' }));
  };
  const people: Person[] = parseCsv(raw.people).map(r => ({
    id: r['معرف_الصحابي'],
    name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] },
    kind: r['النوع'], kindEn: en(r['النوع_EN']),
    category: r['الفئة'] || 'الصحابة',
    bio: r['نبذة_موثقة'], bioEn: en(r['نبذة_موثقة_EN']),
    islam: stated(r['وقت_الإسلام']), islamEn: stated(r['وقت_الإسلام']) && r['وقت_الإسلام_EN'] ? en(r['وقت_الإسلام_EN']) : null,
    death: stated(r['الوفاة_أو_الاستشهاد']), deathEn: stated(r['الوفاة_أو_الاستشهاد']) && r['الوفاة_أو_الاستشهاد_EN'] ? en(r['الوفاة_أو_الاستشهاد_EN']) : null,
    aliases: aliasList(r['أسماء_أخرى'], r.Aliases_EN),
    events: list(r['أحداث_الدرر_المرتبطة']).map(Number).filter(Number.isFinite),
    verses: list(r['أسباب_النزول_المرتبطة']),
    facts: [],
  }));
  const personById = new Map(people.map(p => [p.id, p]));
  for (const r of parseCsv(raw.facts)) {
    const p = personById.get(r['معرف_الصحابي']);
    if (!p) { warn(`7_sahaba_references.csv: "${r['معرف_الحقيقة']}" names an unknown person "${r['معرف_الصحابي']}"`); continue; }
    const id = r['معرف_المصدر_في_المشروع'];
    // Dorar facts cite their event ("حدث 14"); Sahihayn facts cite the hadith ("صحيح مسلم 1748").
    const source = /^حدث\s/.test(id) ? `الدرر السنية · ${id}` : r['المرجع'];
    p.facts.push({ text: r['الحقيقة'], textEn: en(r['الحقيقة_EN']), quote: r['الشاهد_من_المصدر'], quoteEn: en(r['الشاهد_من_المصدر_EN']), source, url: r['الرابط'] || null });
  }

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
    labels.push({ id: r['المعرف'], kind, name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, lat, lon, size: SIZES[r['الحجم']] ?? 'm', rotate: num(r['الدوران']) ?? 0, note: { ar: r['ملاحظة'], en: r.Note_EN || r['ملاحظة'] }, reached: num(r['حدث_بلوغ_الإسلام']), reachNote: { ar: r['ملاحظة_بلوغ_الإسلام'] ?? '', en: r.Reach_Note_EN || r['ملاحظة_بلوغ_الإسلام'] || '' } });
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

  const arcs: MapArc[] = [];
  for (const r of parseCsv(raw.arcs)) {
    const kind = ARC_KINDS[r['النوع']], outcome = OUTCOMES[r['النتيجة']], event = num(r['رقم_حدث_الدرر']);
    const [fLat, fLon, tLat, tLon] = [r['من_lat'], r['من_lon'], r['إلى_lat'], r['إلى_lon']].map(num);
    if (!kind || !outcome || event === null || fLat === null || fLon === null || tLat === null || tLon === null) { warn(`map_arcs.csv: "${r['المعرف']}" needs النوع (رسالة / وفد), النتيجة, رقم_حدث_الدرر and both ends`); continue; }
    arcs.push({ id: r['المعرف'], kind, event, from: { lat: fLat, lon: fLon }, to: { lat: tLat, lon: tLon }, name: { ar: r['الاسم'], en: r.Name_EN || r['الاسم'] }, outcome,
      summary: { ar: r['الخلاصة'], en: r.Summary_EN || r['الخلاصة'] }, quote: r['الشاهد'], quoteEn: r['الشاهد_EN'] || null, source: r['المصدر'], url: r['الرابط'], note: { ar: r['ملاحظة'], en: r.Note_EN || r['ملاحظة'] }, end: { ar: r['اسم_الطرف'] || r['الاسم'], en: r.End_EN || r.Name_EN || r['الاسم'] } });
  }

  const growth = new Map<string, Growth[]>();
  for (const r of parseCsv(raw.growth)) {
    const event = num(r['رقم_حدث_الدرر']), count = num(r['العدد']);
    if (event === null || count === null || !places.has(r['رمز_المكان'])) { warn(`islam_growth.csv: a row for "${r['رمز_المكان']}" needs a place from 4_places.csv, رقم_حدث_الدرر and العدد`); continue; }
    const list = growth.get(r['رمز_المكان']) ?? [];
    list.push({ event, count, what: { ar: r['ما_يعده'], en: r.What_EN || r['ما_يعده'] }, quote: r['الشاهد'], url: r['الرابط'] || `https://dorar.net/history/event/${event}` });
    growth.set(r['رمز_المكان'], list);
  }

  // Background sounds: only kinds the player knows, only for events that exist, each with its source's words.
  const SOUNDS: SoundKind[] = ['battle', 'march', 'caravan', 'walk', 'sea', 'march+sea', 'wind'];
  const sounds = new Map<number, EventSound>();
  for (const r of parseCsv(raw.sounds)) {
    const n = num(r['رقم_حدث_الدرر']), kind = r.Sound as SoundKind, quote = (r['الشاهد'] ?? '').trim();
    if (n === null || !byNumber.has(n) || !SOUNDS.includes(kind) || !quote) { warn(`event_sounds.csv: row for event "${r['رقم_حدث_الدرر']}" needs a known event, a Sound (${SOUNDS.join(', ')}) and الشاهد`); continue; }
    sounds.set(n, { kind, quote, horses: (r['الخيل'] ?? '').trim() || null, note: r['ملاحظة'] ? { ar: r['ملاحظة'], en: r.Note_EN || r['ملاحظة'] } : null });
  }
  const audio = new Map<number, EventAudio>();
  for (const r of parseCsv(raw.audio)) {
    const n = num(r['رقم_حدث_الدرر']), file = (r['الملف'] ?? '').trim();
    if (n === null || !byNumber.has(n) || !/^[\w.-]+\.(mp3|m4a|ogg)$/.test(file)) { warn(`event_audio.csv: row for event "${r['رقم_حدث_الدرر']}" needs a known event and a sound file in public/sounds/`); continue; }
    audio.set(n, { file, label: { ar: r['التسمية'], en: r.Label_EN || r['التسمية'] }, description: { ar: r['الوصف'], en: r.Description_EN || r['الوصف'] } });
  }
  return { events, byNumber, places, verses, people, routes, labels, stops, quiz, arcs, growth, sounds, audio };
}

let cache: Promise<Sirah> | null = null;
export function getSirah() {
  cache ??= loadSirah().catch(error => { cache = null; throw error; });
  return cache;
}

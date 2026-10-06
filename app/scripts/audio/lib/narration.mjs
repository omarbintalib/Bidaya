export const VOICES = { ar: 'ar-KW-FahedNeural', en: 'en-US-Brian:DragonHDLatestNeural' };
export const PERIODS = ['prologue', 'makkah', 'hijrah', 'madinah'];
export const PERIOD_NAMES = {
  ar: ['قبل البعثة', 'العهد المكي', 'الهجرة', 'العهد المدني'],
  en: ['Before prophethood', 'The Makkan period', 'The Hijrah', 'The Madinan period'],
};
export const NORMALIZER_VERSION = 2;
const ones = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
export function arabicNumber(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 999999) throw new Error(`Unsupported Arabic number: ${n}`);
  if (n < 10) return ones[n];
  if (n === 10) return 'عشرة';
  if (n === 11) return 'أحد عشر';
  if (n === 12) return 'اثنا عشر';
  if (n < 20) return `${ones[n - 10]} عشر`;
  if (n < 100) return n % 10 ? `${ones[n % 10]} و${tens[Math.floor(n / 10)]}` : tens[n / 10];
  if (n < 1000) return hundreds[Math.floor(n / 100)] + (n % 100 ? ` و${arabicNumber(n % 100)}` : '');
  const k = Math.floor(n / 1000);
  const first = k === 1 ? 'ألف' : k === 2 ? 'ألفان' : k < 11 ? `${arabicNumber(k)} آلاف` : `${arabicNumber(k)} ألف`;
  return first + (n % 1000 ? ` و${arabicNumber(n % 1000)}` : '');
}
const ordinals = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
// A year follows the noun عام, so use the oblique forms of duals and tens.
const arabicYear = n => arabicNumber(n).replace(/اثنا عشر/g, 'اثني عشر').replace(/اثنان/g, 'اثنين').replace(/مائتان/g, 'مائتين').replace(/ألفان/g, 'ألفين').replace(/(عشر|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع)ون/g, '$1ين');
export const plainDigits = text => text.replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
export const escapeXml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Quran quotations in the source CSVs use braces, with a few audited exceptions. Fail on new malformed markers. */
export function removeQuran(text, locale, eventId, removed = []) {
  const omit = passage => { removed.push({ locale, eventId, passage }); return ''; };
  let s = text;
  if (locale === 'ar' && eventId === 20) {
    s = s.replace(/بسم الله الرحمن الرحيم/g, omit).replace(/\(إِنَّنِي أَنَا اللَّهُ[^)]*\)/g, omit);
  }
  if (locale === 'ar' && eventId === 127) s = s.replace(/\(جاء الحقُّ[^)]*\)/g, omit);
  if (locale === 'ar' && eventId === 85) s = s.replace(/\{[\s\S]*$/, omit); // The source has an unclosed Quran quote.
  if (locale === 'ar' && eventId === 75) s = s.replace(/بَلِّغوا عَنَّا قَومَنا[\s\S]*?وأَرضانا\./g, omit);
  if (locale === 'en' && eventId === 75) s = s.replace(/It reads, ‘Convey to our people[\s\S]*?pleased\.’/g, omit);
  s = s.replace(/\{+[\s\S]*?\}+/g, passage => {
    if (locale === 'en' && eventId === 12 && /cover me/i.test(passage)) return passage.slice(1, -1);
    if (locale === 'en' && eventId === 20) {
      const start = passage.indexOf('“Verily');
      if (start < 0) throw new Error('Unreviewed Quran quote in English event 20');
      omit(passage.slice(start));
      return passage.slice(1, start); // Preserve source narration verbatim; add no replacement sentence.
    }
    return omit(passage);
  }).replace(/﴿[\s\S]*?﴾/g, omit);
  s = s.replace(/\[(?:Qur.?an\s*:?\s*)?\d+:\s*\d+(?:\s*[-–]\s*\d+)?\]/gi, '')
    .replace(/\(Surah[^)]*,\s*\d+\)/gi, '').replace(/\[[A-Za-z-]+:\s*\d+\]/g, '');
  if (/[{}﴿﴾]/.test(s)) throw new Error(`Unreviewed Quran marker in ${locale} event ${eventId}`);
  return s;
}

export function spokenHijri(year, locale) {
  if (year === null) return '';
  if (year === 0) return locale === 'ar' ? 'عام الهجرة' : 'the year of the Hijrah';
  if (locale === 'en') return `${Math.abs(year)} ${year < 0 ? 'years before the Hijrah' : 'after the Hijrah'}`;
  if (year === 1) return 'العام الأول للهجرة';
  if (year === 2) return 'العام الثاني للهجرة';
  return `عام ${arabicYear(Math.abs(year))} ${year < 0 ? 'قبل الهجرة' : 'للهجرة'}`;
}

const monthEn = { 'محرم': 'Muharram', 'صفر': 'Safar', 'ربيع الأول': 'Rabi al-Awwal', 'ربيع الآخر': 'Rabi al-Thani', 'ربيع الثاني': 'Rabi al-Thani', 'جمادى الأولى': 'Jumada al-Ula', 'جمادى الآخرة': 'Jumada al-Thani', 'رجب': 'Rajab', 'شعبان': 'Shaban', 'رمضان': 'Ramadan', 'شوال': 'Shawwal', 'ذو القعدة': 'Dhu al-Qadah', 'ذي القعدة': 'Dhu al-Qadah', 'ذو الحجة': 'Dhu al-Hijjah', 'ذي الحجة': 'Dhu al-Hijjah' };
export function spokenDate(event, locale) {
  const h = spokenHijri(event.year, locale);
  const month = event.month ? (locale === 'ar' ? event.month : monthEn[event.month]) : '';
  if (locale === 'en' && event.month && !month) throw new Error(`Unmapped Hijri month: ${event.month}`);
  const hijri = [month, h].filter(Boolean).join(', ');
  const ce = event.ce !== null ? (locale === 'ar' ? `عام ${arabicYear(event.ce)} للميلاد` : `the year ${event.ce} Common Era`) : '';
  // Narrate one primary date: Hijri when available, otherwise Common Era.
  return hijri || ce;
}

/** Explicit spoken forms for calendars; general quantities use Azure's cardinal SSML. Source prose stays intact. */
export function normalizeText(text, locale) {
  let honorificSeen = false;
  const spoken = locale === 'en' ? text.replace(/ﷺ|\(?\b(?:may )?(?:peace(?: and blessings)? be upon him|Allah bless him and grant him peace)\)?/gi, () => {
    if (honorificSeen) return '';
    honorificSeen = true;
    return ' peace and blessings be upon him ';
  }) : text.replace(/ﷺ/g, ' صلى الله عليه وسلم ');
  let s = plainDigits(spoken).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\[(\d+)\]/g, '').replace(/\s+/g, ' ').trim();
  if (locale === 'ar') {
    s = s.replace(/الفصل\s+([1-4])\b/g, (_, n) => `الفصل ${ordinals[Number(n) - 1]}`)
      .replace(/(\d+)\s*ق\s*\.\s*ه[ـ]?\.?/g, (_, n) => spokenHijri(-Number(n), 'ar'))
      .replace(/(\d+)\s*ه[ـ]\.?(?=$|[\s،,؛;.·)])/g, (_, n) => spokenHijri(Number(n), 'ar'))
      .replace(/(\d{3,4})\s*م\.?(?=$|[\s،,؛;.·)])/g, (_, n) => `عام ${arabicYear(Number(n))} للميلاد`);
  } else {
    s = s.replace(/\b(\d+)\s*(BH|B\.H\.)/g, '$1 years before the Hijrah')
      .replace(/\b(\d+)\s*(AH|A\.H\.)/g, '$1 after the Hijrah').replace(/\b(\d+)\s*CE\b/g, '$1 Common Era');
  }
  // A numeric range must be spoken as a range, not as a negative number.
  s = s.replace(/(\d+)\s*[–—-]\s*(\d+)/g, locale === 'ar' ? 'من $1 إلى $2' : 'from $1 to $2');
  // Punctuation never becomes a spoken "dash". Hyphenated names retain their words.
  return s.replace(/[-‐‑‒–—―−﹘﹣－]+/g, ' ').replace(/\s*·\s*/g, '، ').replace(/\s+/g, ' ').trim();
}
export function toSsml(text, locale, overrides = {}) {
  let normalized = normalizeText(text, locale);
  for (const [original, spoken] of Object.entries(overrides)) normalized = normalized.split(original).join(spoken);
  const body = escapeXml(normalized).replace(/\b\d+\b/g, n => `<say-as interpret-as="cardinal">${n}</say-as>`);
  const content = VOICES[locale].includes('DragonHD') ? body : `<prosody rate="0%">${body}</prosody>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale === 'ar' ? 'ar-KW' : 'en-US'}"><voice name="${VOICES[locale]}">${content}</voice></speak>`;
}

export function chunkText(text, max = 1800) {
  if (max < 100) throw new Error('Chunk limit must be at least 100 characters');
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > max) {
    const window = remaining.slice(0, max + 1);
    const boundary = Math.max(window.lastIndexOf('. '), window.lastIndexOf('؟ '), window.lastIndexOf('! '), window.lastIndexOf('\n'));
    const cut = boundary >= max / 3 ? boundary + 1 : window.lastIndexOf(' ');
    if (cut < 1) throw new Error('Cannot safely split narration: an oversized token');
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
export function reserveCharacters(ledger, count, budget) {
  if (ledger.reservedCharacters + count > budget) throw new Error(`Free-tier budget reached: ${ledger.reservedCharacters}/${budget}. Completed audio is saved; resume next month.`);
  ledger.reservedCharacters += count;
}
export function narrationEntries(rows, translations, removed = []) {
  const translated = new Map(translations.map(r => [Number(r.dorar_event_number), r]));
  const events = rows.map(r => ({
    n: Number(r.dorar_event_number), order: Number(r['ترتيب_العرض']),
    period: PERIODS[PERIOD_NAMES.ar.indexOf(r['الفترة'])],
    year: r['السنة_الهجرية'] === '' ? null : Number(r['السنة_الهجرية']),
    ce: r['السنة_الميلادية'] === '' ? null : Number(r['السنة_الميلادية']), month: r['الشهر_الهجري'] || null,
    title: { ar: r['العنوان_في_الدرر'].replace(/\s*\.\s*$/, ''), en: translated.get(Number(r.dorar_event_number))?.title_en_display },
    text: { ar: r['النص'], en: translated.get(Number(r.dorar_event_number))?.text_en_dorar },
  })).sort((a, b) => a.order - b.order);
  if (events.some(e => !e.period || !Number.isInteger(e.n)) || new Set(events.map(e => e.n)).size !== events.length) throw new Error('Invalid or duplicate event IDs');
  const entries = [];
  for (const locale of ['ar', 'en']) for (const [p, period] of PERIODS.entries()) {
    const chapterEvents = events.filter(e => e.period === period);
    if (!chapterEvents.length) continue;
    const firstYear = chapterEvents[0].year, lastYear = chapterEvents.at(-1).year;
    const from = spokenHijri(firstYear, locale), to = spokenHijri(lastYear, locale);
    const chapterDate = firstYear === lastYear ? from : locale === 'ar' ? `من ${from} إلى ${to}` : `${from} to ${to}`;
    entries.push({ id: `chapter-${period}`, locale, kind: 'chapter', sourceYears: [firstYear, lastYear], text: `${locale === 'ar' ? `الفصل ${ordinals[p]}` : `Chapter ${p + 1}`}. ${PERIOD_NAMES[locale][p]}. ${chapterDate}.` });
    for (const e of chapterEvents) {
      if (!e.title[locale] || !e.text[locale]) throw new Error(`Missing ${locale} text for event ${e.n}`);
      const body = removeQuran(e.text[locale], locale, e.n, removed);
      entries.push({ id: `event-${e.n}`, locale, kind: 'event', sourceTitle: e.title[locale], sourceBody: e.text[locale], body, date: spokenDate(e, locale), text: `${e.title[locale]}. ${spokenDate(e, locale)}. ${body}`, event: e });
    }
  }
  return entries;
}

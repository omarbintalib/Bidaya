import type { Period, Place, QuizQuestion, Sirah, SirahEvent } from './types';

/**
 * More chapter questions beyond quiz.csv, built from the events themselves: "where did this happen?", answered
 * by the event's own place in 2_sirah_events.csv. Only events with an exact, sourced place qualify, and only
 * when the title does not already name the place. The quote is the first sentence of the event's Dorar text,
 * word for word, so every generated question cites its source just as the curated ones do.
 */

const fold = (s: string) => s.normalize('NFC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const AR_GENERIC = new Set(['جبل', 'وادي', 'غار', 'مسجد', 'بير', 'بئر', 'سوق', 'دار', 'بني', 'بنو', 'عين', 'ارض', 'بلاد', 'مدينه', 'طريق', 'تقريبي',
  'ابي', 'ابو', 'طالب', 'ديار', 'ماء', 'بين', 'علي', 'بحر', 'ساحل', 'شعب', 'موقع', 'معركه', 'مكرمه', 'منوره', 'حرام', 'شريف', 'مشرفه']);
const EN_GENERIC = new Set(['prophet', "prophet's", 'mosque', 'banu', 'bani', 'lands', 'abi', 'abu', 'aboo', 'talib', 'taalib', 'sea', 'coast', 'mount', 'valley', 'cave', 'well', 'approximate', 'battle', 'site', 'red']);
const arWords = (s: string) => fold(s).split(/[^ء-ي]+/).map(w => w.replace(/^(وال|بال|لل|ال|و)/, '')).filter(w => w.length >= 3 && !AR_GENERIC.has(w));
/** English spellings vary (Makkah, Mecca, Madeenah, Medina), so words are compared by their consonants. */
const enKey = (w: string) => w.toLowerCase().replace(/^al-/, '').replace(/[c|q]/g, 'k').replace(/[^a-z]/g, '').replace(/[aeiouyhw]/g, '').replace(/(.)\1+/g, '$1');
const enWords = (s: string) => s.split(/[\s\-–(),.]+/).filter(w => !EN_GENERIC.has(w.toLowerCase().replace(/[’‘]/g, "'"))).map(enKey).filter(k => k.length >= 3);

/** Every place or region name on the map, so a question never names a place in its own wording. */
function placeWords(data: Sirah) {
  const names = [...[...data.places.values()].map(p => p.name), ...data.labels.map(l => l.name), ...data.events.map(e => e.placeName)]
    .map(n => ({ ar: n.ar.replace(/\(.*?\)/g, ''), en: n.en.replace(/\(.*?\)/g, '') }));
  return { ar: new Set(names.flatMap(n => arWords(n.ar))), en: new Set(names.flatMap(n => enWords(n.en))) };
}

/** The first sentence of a Dorar text, exactly as written. */
export function firstSentence(text: string, max = 220) {
  const t = text.trim();
  const end = t.search(/[.!?؟](\s|$)/);
  const s = end > 20 ? t.slice(0, end + 1) : t;
  return s.length > max ? s.slice(0, s.lastIndexOf(' ', max)) + ' …' : s;
}

const MAX_PER_ANSWER = 4;
const far = (a: Place, b: Place) => Math.hypot(a.lat - b.lat, a.lon - b.lon) >= 0.8;

/** A small stable shuffle, so the same question always offers the same choices. */
function seeded(n: number) {
  let s = n * 2654435761 >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** `candidates` must be sorted by key (byKey), so the shuffle does not depend on the order they were found in. */
function options(answer: Place, candidates: Place[], n: number): string[] | null {
  const rand = seeded(n);
  const pool = candidates.map(p => [rand(), p] as const).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const picked: Place[] = [];
  for (const p of pool) {
    if (picked.length === 2) break;
    if (p.key !== answer.key && far(p, answer) && picked.every(q => far(p, q))) picked.push(p);
  }
  if (picked.length < 2) return null;
  const all = [answer, ...picked].map(p => p.key);
  const at = Math.floor(rand() * 3); // where the right answer sits
  [all[0], all[at]] = [all[at], all[0]];
  return all;
}

/** Every chapter's questions: the curated ones from quiz.csv first, then the generated ones in story order. */
export function quizPools(data: Sirah): Map<Period, QuizQuestion[]> {
  const pools = new Map<Period, QuizQuestion[]>();
  for (const q of data.quiz) pools.set(q.period, [...(pools.get(q.period) ?? []), q]);
  const used = new Set(data.quiz.map(q => q.event));
  const events = [...data.events].sort((a, b) => a.order - b.order);
  // The candidate places are the same for every event of a chapter: gather and sort them once, not per event.
  const byKey = (places: Place[]) => places.sort((a, b) => a.key.localeCompare(b.key));
  const chapterPlaces = new Map<Period, Place[]>();
  const placesOf = (period: Period) => {
    let list = chapterPlaces.get(period);
    if (!list) chapterPlaces.set(period, list = byKey([...new Set(events.filter(e => e.period === period && e.place).map(e => e.place!))].map(k => data.places.get(k)).filter((p): p is Place => !!p)));
    return list;
  };
  const everywhere = byKey([...data.places.values()].filter(p => p.events > 0));
  const named = placeWords(data);
  const answers = new Map<string, number>(); // period + place → questions so far, so one city does not answer them all

  for (const e of events) {
    const place = e.place ? data.places.get(e.place) : undefined;
    if (!place || used.has(e.n) || e.precision !== 'exact' || e.inferred || !e.title.en || !e.text.ar.trim()) continue;
    if (arWords(e.title.ar).some(w => named.ar.has(w)) || enWords(e.title.en).some(w => named.en.has(w))) continue;
    const seen = answers.get(e.period + place.key) ?? 0;
    if (seen >= MAX_PER_ANSWER) continue;
    const opts = options(place, placesOf(e.period), e.n) ?? options(place, everywhere, e.n);
    if (!opts) continue;
    used.add(e.n);
    answers.set(e.period + place.key, seen + 1);
    const title = { ar: e.title.ar, en: e.title.en.replace(/\s*\.\s*$/, '') };
    pools.set(e.period, [...(pools.get(e.period) ?? []), {
      id: `E${e.n}`, period: e.period,
      question: { ar: `أين كان هذا الحدث: «${title.ar}»؟`, en: `Where did this happen: “${title.en}”?` },
      answer: place.key, options: opts,
      explanation: { ar: `كان ذلك في ${e.placeName.ar}، كما في الدرر السنية:`, en: `This happened at ${e.placeName.en}. Dorar's account begins:` },
      event: e.n, quote: firstSentence(e.text.ar), url: e.url,
    }]);
  }
  return pools;
}

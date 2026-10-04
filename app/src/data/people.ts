import type { Person, Sirah, SirahEvent } from './types';

/**
 * Finds the Companions from 6_sahaba.csv where they are named in a passage, so the names can be linked.
 * Arabic: the name without honorifics, its "X ibn Y" part, its kunya (أبو / أم …), and a first name when
 * it is unique in the list — matched across diacritics and أبو/أبي/أبا. English: the same parts, capitalised,
 * with doubled vowels folded so Dorar's spellings ("Aboo Bakr", "Khadeejah") meet the list's ("Abu Bakr").
 */

export interface NameSpan { start: number; end: number; person: Person }

const HONORIFIC = /\s*(رضي الله عنهما|رضي الله عنها|رضي الله عنه|ﷺ)\s*/g;
const DIAC = '[\\u064B-\\u065F\\u0670\\u0640]*';
const AR_LETTER = '\\u0621-\\u064A';
// First names that are also common words or are shared with other people in the texts (e.g. عمرو is also
// Abu Jahl's name, معاذ also Mu'adh ibn Amr): these link only as part of a longer name.
const AR_SINGLE_BLOCK = new Set(['أسماء', 'محمد', 'عبد', 'أبو', 'أم', 'علي', 'عمر', 'عمرو', 'سلمة', 'معاذ', 'عامر', 'هلال', 'عبيدة']);
const EN_SINGLE_BLOCK = new Set(['muhamad', 'amr', 'muad', 'amir', 'salama', 'hilal', 'ubayda', 'asad', 'asma', 'abd']);
const EN_SKIP = new Set(['al', 'el', 'the', 'of', 'mother', 'daughter', 'prophet']);
const EN_LINKS = new Set(['ibn', 'bint', 'al']);

/** Fold Dorar's long-vowel spellings and doubled letters: Khadeejah → khadija, Aboo → abu, Uthmaan → uthman. */
function nameKey(word: string) {
  const k = word.toLowerCase().replace(/[‘’'ʿʾ`;]/g, '')
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo|ou/g, 'u')
    .replace(/([a-z])\1+/g, '$1').replace(/h$/, '');
  if (k === 'abi' || k === 'aba') return 'abu';
  if (k === 'bin') return 'ibn';
  return k;
}

function arPattern(alias: string) {
  const words = alias.split(/\s+/).map(word => {
    if (/^[أا]بو$|^[أا]بي$/.test(word)) return `[أا]ب${DIAC}[ويا]${DIAC}`;
    if (word === 'بن' || word === 'ابن') return `ا?ب${DIAC}ن${DIAC}`;
    return [...word].map(c => {
      if ('اأإآ'.includes(c)) return `[اأإآٱ]${DIAC}`;
      if ('يى'.includes(c)) return `[يى]${DIAC}`;
      if ('ةه'.includes(c)) return `[ةه]${DIAC}`;
      return c + DIAC;
    }).join('');
  });
  // Allow a joined و / ف / ب / ل before the name; stop at the end of the word.
  return `(?<=(?:^|[^${AR_LETTER}\\u064B-\\u065F\\u0670])(?:[وفبل]${DIAC})?)${words.join('\\s+')}(?![${AR_LETTER}])`;
}

const coreAr = (p: Person) => p.name.ar.replace(HONORIFIC, ' ').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

function arAliases(p: Person, firstNames: Map<string, number>) {
  const core = coreAr(p);
  const w = core.split(/\s+/);
  // The other names in 6_sahaba.csv (أسماء_أخرى) are taken as written.
  const out = new Set([core, ...p.aliases.map(a => a.ar).filter(Boolean)]);
  const ibn = w.findIndex(x => x === 'بن' || x === 'بنت');
  const short = ibn > 0 && ibn + 1 < w.length ? w.slice(0, ibn + (['أبي', 'عبد', 'أبو'].includes(w[ibn + 1]) ? 3 : 2)) : [];
  if (short.length && !['بن', 'ابن', 'بنت'].includes(short[short.length - 1])) out.add(short.join(' '));
  if ((w[0] === 'أبو' || w[0] === 'أم') && w.length > 1) out.add(w.slice(0, 2).join(' '));
  if (w[0] !== 'أبو' && w[0] !== 'أم' && firstNames.get(w[0]) === 1 && !AR_SINGLE_BLOCK.has(w[0]) && w[0].length >= 3) out.add(w[0]);
  out.delete('');
  return [...out];
}

const enWords = (s: string) => [...s.matchAll(/[A-Za-z‘’'ʿʾ`]+/g)].map(m => {
  const raw = m[0].replace(/^[‘’'ʿʾ`]+/, '');
  return { key: nameKey(raw), start: m.index! + (m[0].length - raw.length), end: m.index! + m[0].length, raw: raw.toLowerCase(), capital: /^[A-Z]/.test(raw) };
}).filter(w => !EN_SKIP.has(w.raw) && w.key.length > 0);

function enAliases(p: Person, firstNames: Map<string, number>) {
  const w = enWords(p.name.en.replace(/\(.*?\)|,.*$/g, '')).map(x => x.key);
  const out: string[][] = [w, ...p.aliases.map(a => enWords(a.en).map(x => x.key)).filter(k => k.length)];
  const ibn = w.findIndex(k => k === 'ibn' || k === 'bint');
  if (ibn > 0 && ibn + 1 < w.length) out.push(w.slice(0, ibn + (w[ibn + 1] === 'abu' || w[ibn + 1] === 'abd' ? 3 : 2)));
  if ((w[0] === 'abu' || w[0] === 'um') && w.length > 1) out.push(w.slice(0, 2));
  if (w[0] !== 'abu' && w[0] !== 'um' && firstNames.get(w[0]) === 1 && !EN_SINGLE_BLOCK.has(w[0]) && w[0].length >= 3) out.push([w[0]]);
  return out.filter(a => a.length);
}

interface Matcher { ar: { re: RegExp; person: Person }[]; en: { keys: string[]; person: Person }[] }
const matchers = new WeakMap<Sirah, Matcher>();

function matcherFor(data: Sirah): Matcher {
  let m = matchers.get(data);
  if (m) return m;
  const count = (keys: string[]) => keys.reduce((map, k) => map.set(k, (map.get(k) ?? 0) + 1), new Map<string, number>());
  const arFirst = count(data.people.map(p => coreAr(p).split(/\s+/)[0]));
  const enFirst = count(data.people.map(p => enWords(p.name.en)[0]?.key ?? ''));
  const ar = data.people.flatMap(person => arAliases(person, arFirst).map(a => ({ re: new RegExp(arPattern(a), 'gu'), person, len: a.length })))
    .sort((a, b) => b.len - a.len);
  const en = data.people.flatMap(person => enAliases(person, enFirst).map(keys => ({ keys, person })))
    .sort((a, b) => b.keys.length - a.keys.length);
  m = { ar, en };
  matchers.set(data, m);
  return m;
}

/** Non-overlapping spans of Companion names in `text`, longest names first. */
export function findPeople(data: Sirah, text: string, lang: 'ar' | 'en'): NameSpan[] {
  const m = matcherFor(data), spans: NameSpan[] = [];
  const free = (s: number, e: number) => spans.every(x => e <= x.start || s >= x.end);
  if (lang === 'ar') {
    for (const { re, person } of m.ar) {
      re.lastIndex = 0;
      for (const hit of text.matchAll(re)) {
        const s = hit.index!, e = s + hit[0].length;
        if (free(s, e)) spans.push({ start: s, end: e, person });
      }
    }
  } else {
    const words = enWords(text);
    for (const { keys, person } of m.en) {
      for (let i = 0; i + keys.length <= words.length; i++) {
        if (!keys.every((k, j) => words[i + j].key === k && (words[i + j].capital || EN_LINKS.has(k)))) continue;
        const s = words[i].start, e = words[i + keys.length - 1].end;
        if (free(s, e)) spans.push({ start: s, end: e, person });
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

export interface Mention { event: SirahEvent; text: string; lang: 'ar' | 'en' }

/**
 * Where an event's Dorar text names this person: the sentence around the first mention, word for word (clipped
 * with … when long). Used to give each person's card the sources' own words, with nothing written in between.
 */
export function mentionIn(data: Sirah, person: Person, e: SirahEvent, lang: 'ar' | 'en', max = 280): Mention | null {
  const l = lang === 'en' && e.text.en ? 'en' : 'ar';
  const text = l === 'en' ? e.text.en : e.text.ar;
  const hit = findPeople(data, text, l).find(s => s.person.id === person.id);
  if (!hit) return null;
  const stops = /[.!?؟\n]/;
  let start = hit.start;
  while (start > 0 && !stops.test(text[start - 1])) start--;
  let end = hit.end;
  while (end < text.length && !stops.test(text[end])) end++;
  if (end < text.length && text[end] !== '\n') end++;
  let a = start, b = end;
  if (b - a > max) {
    a = Math.max(start, hit.start - Math.round(max * 0.4));
    b = Math.min(end, a + max);
    if (a > start) a = text.indexOf(' ', a) + 1 || a;
    if (b < end) b = text.lastIndexOf(' ', b) > a ? text.lastIndexOf(' ', b) : b;
  }
  const body = text.slice(a, b).trim();
  if (body.length < 12) return null;
  return { event: e, text: `${a > start ? '… ' : ''}${body}${b < end ? ' …' : ''}`, lang: l };
}

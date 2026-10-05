import { normalize } from '../assistant/answer';
import type { Locale } from '../i18n';
import type { Sirah } from './types';

export type SearchKind = 'event' | 'person' | 'place' | 'verse';
export interface SearchResult { kind: SearchKind; id: string; title: string; sub: string; score: number }

/** Latin text compared by its consonants, so "Medina", "Madinah" and Dorar's "Madeenah" find one another. */
const skeleton = (s: string) => s.replace(/[a-z]+/g, w => w[0] + w.slice(1).replace(/[aeiouy]/g, '').replace(/h$/, '').replace(/(.)\1+/g, '$1'));
const key = (s: string) => skeleton(normalize(s)).replace(/\s+/g, ' ').trim();

interface Entry { kind: SearchKind; id: string; names: string[]; title: Record<Locale, string>; sub: Record<Locale, string> }
const cache = new WeakMap<Sirah, { entry: Entry; keys: string[] }[]>();

function index(data: Sirah) {
  const hit = cache.get(data);
  if (hit) return hit;
  const entries: Entry[] = [];
  for (const e of data.events) entries.push({ kind: 'event', id: String(e.n), names: [e.title.ar, e.title.en, e.placeName.ar, e.placeName.en],
    title: { ar: e.title.ar, en: e.title.en || e.title.ar }, sub: { ar: e.placeName.ar, en: e.placeName.en } });
  for (const p of data.people) entries.push({ kind: 'person', id: p.id, names: [p.name.ar, p.name.en, ...p.aliases.flatMap(a => [a.ar, a.en])],
    title: p.name, sub: { ar: p.kind, en: p.kindEn ?? '' } });
  for (const p of data.places.values()) entries.push({ kind: 'place', id: p.key, names: [p.name.ar, p.name.en, p.nameBefore?.ar ?? '', p.nameBefore?.en ?? ''],
    title: p.name, sub: { ar: p.nameBefore ? `سابقًا: ${p.nameBefore.ar}` : '', en: p.nameBefore ? `earlier: ${p.nameBefore.en}` : '' } });
  for (const v of data.verses) entries.push({ kind: 'verse', id: v.id, names: [v.title.ar, v.title.en, `سورة ${v.surah}`, `surah ${v.surahEn ?? ''}`, v.ref],
    title: { ar: v.title.ar, en: v.title.en || v.title.ar }, sub: { ar: `سورة ${v.surah} ${v.ref}`, en: `Surah ${v.surahEn ?? v.surah} ${v.ref}` } });
  const built = entries.map(entry => ({ entry, keys: entry.names.filter(Boolean).map(key) }));
  cache.set(data, built);
  return built;
}

/**
 * Events, people, places and verses whose names contain every word typed (any order, any spelling of the
 * diacritics, and English spellings that differ only in vowels). Whole-name and word-start matches rank first.
 */
export function search(data: Sirah, query: string, locale: Locale, limit = 24): SearchResult[] {
  const words = key(query).split(' ').filter(w => w.length >= 2 || /\d/.test(w));
  if (!words.length) return [];
  const out: SearchResult[] = [];
  const weight: Record<SearchKind, number> = { place: 4, person: 3, event: 2, verse: 1 };
  for (const { entry, keys } of index(data)) {
    let best = 0;
    for (const k of keys) {
      if (!words.every(w => k.includes(w))) continue;
      const s = (k === words.join(' ') ? 60 : 0) + words.reduce((n, w) => n + (k.startsWith(w) ? 20 : new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(k) ? 12 : 4), 0) - k.length / 40;
      best = Math.max(best, s);
    }
    if (best > 0) out.push({ kind: entry.kind, id: entry.id, title: entry.title[locale] || entry.title.ar, sub: entry.sub[locale] || entry.sub.ar, score: best + weight[entry.kind] });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

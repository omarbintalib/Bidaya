import type { Locale } from '../i18n';
import type { Period, Person, Sirah, SirahEvent, Verse } from './types';

export const PERIOD_ORDER: Period[] = ['prologue', 'makkah', 'hijrah', 'madinah'];
export const periodName: Record<Locale, Record<Period, string>> = {
  ar: { prologue: 'قبل البعثة', makkah: 'العهد المكي', hijrah: 'الهجرة', madinah: 'العهد المدني' },
  en: { prologue: 'Before prophethood', makkah: 'The Makkan period', hijrah: 'The Hijrah', madinah: 'The Madinan period' },
};

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const digits = (value: number | string, locale: Locale) => locale === 'ar' ? String(value).replace(/\d/g, d => AR_DIGITS[+d]) : String(value);

/** "13 BH" / "2 AH" / "13 ق.هـ" / "2 هـ" */
export function hijri(year: number | null, locale: Locale) {
  if (year === null) return '';
  if (year === 0) return locale === 'ar' ? 'عام الهجرة' : 'Year of the Hijrah';
  const n = digits(Math.abs(year), locale);
  if (locale === 'ar') return year < 0 ? `${n} ق.هـ` : `${n} هـ`;
  return year < 0 ? `${n} BH` : `${n} AH`;
}

export function dateLine(e: SirahEvent, locale: Locale) {
  const parts = [e.month && locale === 'ar' ? `${e.month} ` : '', hijri(e.year, locale)].join('');
  const ce = e.ce ? (locale === 'ar' ? `${digits(e.ce, locale)} م` : `${e.ce} CE`) : '';
  return [parts, ce].filter(Boolean).join(' · ');
}

export interface EventVerses { direct: Verse[]; context: Verse[]; stage: Verse[] }

/** Verses for an event, by the link types in 3_links_surahs_sirah.csv. Placeholders never appear here. */
export function versesFor(data: Sirah, e: SirahEvent): EventVerses {
  const direct: Verse[] = [], context: Verse[] = [], stage: Verse[] = [];
  for (const v of data.verses) {
    const l = v.link;
    if (!l) continue;
    if ((l.type === 'direct' || l.type === 'after') && l.event === e.n) direct.push(v);
    else if (l.type === 'suggested' && l.at === e.order) direct.push(v);
    else if (l.type === 'context' && l.event === e.n) context.push(v);
    else if (l.type === 'stage' && l.from !== null && l.to !== null && e.order >= l.from && e.order <= l.to) stage.push(v);
  }
  // Verses a hadith ties to the event come first; those placed here only by estimate ('suggested') go last.
  const rank = (v: Verse) => (v.link?.type === 'suggested' ? 1 : 0);
  direct.sort((a, b) => rank(a) - rank(b));
  return { direct, context, stage };
}

export const peopleFor = (data: Sirah, e: SirahEvent): Person[] => data.people.filter(p => p.events.includes(e.n));

/** Verses the sources link to no event — shown in their own panel, never on the timeline. */
export const unplacedVerses = (data: Sirah) => data.verses.filter(v => !v.link || v.link.type === 'placeholder');

export const hadithLinks = (v: Verse) => [
  ...v.bukhari.map(n => ({ book: 'bukhari' as const, n, url: `https://sunnah.com/bukhari:${n.replace(/\D+$/, '')}` })),
  ...v.muslim.map(n => ({ book: 'muslim' as const, n, url: `https://sunnah.com/muslim:${n.replace(/\D+$/, '')}` })),
];


/** First sentences of a text, cut at a sentence boundary near `max` characters. */
export function excerpt(text: string, max = 280) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 80);
  const stop = Math.max(cut.lastIndexOf('. ', max + 60), cut.lastIndexOf('.', max + 60), cut.lastIndexOf('،', max), cut.lastIndexOf(' ', max));
  return text.slice(0, stop > max * 0.5 ? stop + 1 : max).trim() + '…';
}

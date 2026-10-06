import { createHash } from 'node:crypto';
import { normalizeText, removeQuran, spokenHijri } from './narration.mjs';
import { elevenLabsArabicText } from './elevenlabs-text.mjs';

export const SUMMARY_VOICES = { en: 'MFZUKuGQUsGJPQjTS4wC', ar: 'Ywuz3KyW2N5pqKNpwcCL' };
export const SUMMARY_MODEL = 'eleven_v4';
export const SUMMARY_SETTINGS = { stability: .5, similarity_boost: .75, style: .2, use_speaker_boost: true, speed: 1 };
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The same title, year and complete quote array as SummaryFilm; never use generated prose. */
export function summaryEntries(moments, events, translations, exclusions = []) {
  const byNumber = new Map(events.map(r => [Number(r.dorar_event_number), r]));
  const translated = new Map(translations.map(r => [Number(r.dorar_event_number), r]));
  const split = s => (s || '').split('|').map(q => q.trim()).filter(Boolean);
  const sorted = [...moments].sort((a, b) => Number(a['الترتيب']) - Number(b['الترتيب']));
  if (sorted.length !== 21 || new Set(sorted.map(r => r['رقم_حدث_الدرر'])).size !== 21) throw Error('Unexpected summary moments');
  return ['en', 'ar'].flatMap(locale => sorted.map((m, order) => {
    const n = Number(m['رقم_حدث_الدرر']), event = byNumber.get(n), translation = translated.get(n);
    if (!event || !translation) throw Error('Unknown summary event ' + n);
    const title = locale === 'en' ? translation.title_en_display : event['العنوان_في_الدرر'].replace(/\s*\.\s*$/, '');
    const quotes = split(locale === 'en' ? m.Quotes_EN : m['المقتطفات']);
    const body = locale === 'en' ? translation.text_en_dorar : event['النص'];
    if (!title || !quotes.length || quotes.some(q => !body.includes(q))) throw Error(`Summary is not verbatim: ${locale}/${n}`);
    const year = event['السنة_الهجرية'].trim() === '' ? null : Number(event['السنة_الهجرية']);
    const date = spokenHijri(year, locale);
    const raw = [title, date, ...quotes.map(q => removeQuran(q, locale, n, exclusions))].filter(Boolean).join('. ');
    const text = locale === 'en' ? normalizeText(raw, locale) : elevenLabsArabicText(raw);
    if (/[{}﴿﴾<>–—−]/.test(text)) throw Error('Unreviewed narration symbols');
    const voiceId = SUMMARY_VOICES[locale];
    const hash = digest({ text, model: SUMMARY_MODEL, voiceId, settings: SUMMARY_SETTINGS });
    const id = `summary-event-${n}`;
    return { id, locale, event: n, order: order + 1, title, year, quotes, text, sourceHash: digest({ title, year, quotes }), hash,
      path: `${locale}/${id}-${locale === 'en' ? 'jon' : 'eid'}-v4-${hash.slice(0, 12)}.mp3` };
  }));
}

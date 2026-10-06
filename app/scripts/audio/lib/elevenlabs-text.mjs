import { arabicNumber, normalizeText } from './narration.mjs';

/** Plain Arabic speech input: no Azure SSML, voice tags or spoken symbol names. */
export function elevenLabsArabicText(text) {
  return normalizeText(text, 'ar')
    .replace(/\d+/g, n => arabicNumber(Number(n)))
    .replace(/[:;,]/g, '،')
    .replace(/\?/g, '؟')
    .replace(/[\p{S}\p{P}]/gu, symbol => '.،؛؟!'.includes(symbol) ? symbol : ' ')
    .replace(/\s+/g, ' ').trim();
}

import type { Locale } from '../i18n';

/** Number of ayat in each surah (1–114), standard Hafs count. */
const AYAT = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

export interface QuranRef { surah: number; from: number; to: number; label: string; url: string }

/**
 * Quranpedia reader links for a verse reference such as "2:184-185" or "25:68-70; 39:53".
 * Same rules as the v10 prototype: a range of up to 20 ayat opens whole, a longer one opens at its first ayah;
 * a whole surah opens whole when it has 20 ayat or fewer. English opens the translations view.
 */
export function quranpediaRefs(ref: string, whole: boolean, locale: Locale): QuranRef[] {
  return [...ref.matchAll(/(\d+):(\d+)(?:[-–](\d+))?/g)].map(([, s, a, b]) => {
    const surah = Number(s), from = whole ? 1 : Number(a), to = whole ? AYAT[surah - 1] : Number(b ?? a);
    const ayah = to - from < 20 ? (to > from ? `${from}-${to}` : `${from}`) : `${from}`;
    const url = `https://quranpedia.net/embed?surah=${surah}&ayah=${ayah}${locale === 'en' ? '&type=translations' : ''}`;
    return { surah, from, to, label: whole ? `${surah}` : `${surah}:${from}${to > from ? `–${to}` : ''}`, url };
  });
}

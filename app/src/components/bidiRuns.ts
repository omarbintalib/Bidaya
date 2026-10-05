/**
 * An answer is revealed word by word, each word in a box of its own. Boxes are laid out in the order the words were
 * written, so a run of words in the other script — "رضي الله عنها" in an English answer, "Sahih al-Bukhari" in an
 * Arabic one — would read backwards. Such a run is kept in one box, in its own direction; punctuation around it
 * stays outside, where the sentence puts it.
 */
export interface Token { text: string; dir?: 'rtl' | 'ltr'; glued?: boolean }

const LATIN = /[A-Za-zÀ-ɏ]/;
const ARABIC = /[֐-ࣿיִ-ﷹﷻ-﷿ﹰ-﻿]/; // ﷺ (U+FDFA) is left neutral
/** The direction of a word's first strong letter, if it has one. */
function strong(word: string): 'rtl' | 'ltr' | null {
  for (const ch of word) {
    if (LATIN.test(ch)) return 'ltr';
    if (ARABIC.test(ch)) return 'rtl';
  }
  return null;
}
const EDGE = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u;

/** The answer's words as boxes for the reveal: `glued` boxes follow the previous one with no space. */
export function bidiRuns(text: string): Token[] {
  const words = text.split(/\s+/).filter(Boolean);
  const base = words.map(strong).find(Boolean) ?? 'ltr';
  const out: Token[] = [];
  for (let i = 0; i < words.length; i++) {
    const d = strong(words[i]);
    if (d === null || d === base) { out.push({ text: words[i] }); continue; }
    // A run of the other script: its words, and neutral ones (numbers, dashes) between two of them.
    let j = i;
    while (j + 1 < words.length) {
      const next = strong(words[j + 1]);
      if (next === d) { j++; continue; }
      if (next === null) {
        let k = j + 1;
        while (k < words.length && strong(words[k]) === null) k++;
        if (k < words.length && strong(words[k]) === d) { j = k; continue; }
      }
      break;
    }
    // Numbers right after a Latin run read with it ("Sahih al-Bukhari 3905"), as the browser would put them.
    while (d === 'ltr' && j + 1 < words.length && strong(words[j + 1]) === null && /\d/.test(words[j + 1])) j++;
    const run = words.slice(i, j + 1).join(' ');
    // Punctuation before and after the run belongs to the sentence around it.
    const [, lead, core, trail] = run.match(EDGE)!;
    if (lead) out.push({ text: lead });
    out.push({ text: core, dir: d, glued: !!lead });
    if (trail) out.push({ text: trail, glued: true });
    i = j;
  }
  return out;
}

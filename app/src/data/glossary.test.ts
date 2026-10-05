import { describe, expect, it } from 'vitest';
import { copy } from '../i18n';
import { journeyCopy } from '../journey/copy';
import { landingCopy } from '../landing/copy';
import { mapCopy } from '../map/copy';
import { parseCsv } from './csv';

// glossary.csv at the repository root holds one approved English spelling per term and the spellings not to use.
// It applies to English the team writes. Word-for-word quotes keep the source's own spelling (Dorar writes "Aboo Bakr").
const files = import.meta.glob<string>('../../../*.csv', { query: '?raw', import: 'default', eager: true });
const byName = new Map(Object.entries(files).map(([path, text]) => [path.split('/').pop()!, text]));
const QUOTED = new Set(['نص_الحديث_EN', 'رابط_نص_الحديث_EN', 'الشاهد_من_المصدر_EN', 'الشاهد_EN', 'Translation_EN', 'Ayah_EN', 'title_en_dorar', 'text_en_dorar', 'title_en_display', 'رابط_الدرر_الإنجليزي', 'مصدر_الترجمة_EN', 'Aliases_EN']);

const glossary = parseCsv(byName.get('glossary.csv')!);
const avoid = glossary.flatMap(r => r['لا_تستخدم'].split('؛').map(s => s.trim()).filter(Boolean));
const pattern = (word: string) => new RegExp(`(?<![\\p{L}'])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');

/** Every piece of English the team wrote: the _EN columns of the data files and the interface copy. */
function teamEnglish(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const [name, raw] of byName) {
    if (name === 'glossary.csv') continue;
    for (const row of parseCsv(raw)) for (const [col, text] of Object.entries(row)) {
      if (col.endsWith('_EN') && !QUOTED.has(col) && text) out.push({ where: `${name} ${col}`, text });
    }
  }
  const walk = (value: unknown, where: string) => {
    if (typeof value === 'string') out.push({ where, text: value });
    else if (typeof value === 'function') out.push({ where, text: String(value) });
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
  };
  walk(copy.en, 'copy.en'); walk(journeyCopy.en, 'journeyCopy.en'); walk(landingCopy.en, 'landingCopy.en'); walk(mapCopy.en, 'mapCopy.en');
  return out;
}

describe('English glossary', () => {
  const english = teamEnglish();

  it('has terms to check against', () => {
    expect(glossary.length).toBeGreaterThan(20);
    expect(english.length).toBeGreaterThan(500);
  });

  it('uses the approved spelling for every glossary term', () => {
    const found = english.flatMap(({ where, text }) => avoid.filter(w => pattern(w).test(text)).map(w => `${where}: "${w}"`));
    expect(found).toEqual([]);
  });

  it("drops the apostrophe at the start of a name (Umar, Ali, Abd al-Muttalib) and keeps it inside one (Sa'd, Ka'b)", () => {
    const found = english.filter(({ text }) => /(?<![A-Za-z])'(?=[A-Z][a-z])/.test(text) && !/'[A-Z][^']*'/.test(text)).map(e => e.where);
    expect(found).toEqual([]);
  });
});

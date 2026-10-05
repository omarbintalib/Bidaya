import { expect, it } from 'vitest';
import { bidiRuns } from './bidiRuns';

const show = (text: string) => bidiRuns(text).map(t => (t.glued ? '' : ' ') + (t.dir ? `[${t.dir}:${t.text}]` : t.text)).join('').trim();

it('keeps an Arabic honorific in an English answer together, in its own direction, its commas outside', () => {
  expect(show('Khadijah bint Khuwaylid رضي الله عنها was a noble woman.')).toBe('Khadijah bint Khuwaylid [rtl:رضي الله عنها] was a noble woman.');
  expect(show('Abu Sufyan, رضي الله عنه, saw the army.')).toBe('Abu Sufyan, [rtl:رضي الله عنه], saw the army.');
  expect(show('He said («إنما الأعمال بالنيات») and left.')).toBe('He said («[rtl:إنما الأعمال بالنيات]») and left.');
});

it('keeps an English phrase in an Arabic answer together, numbers inside it', () => {
  expect(show('رواه Sahih al-Bukhari 3905 في صحيحه.')).toBe('رواه [ltr:Sahih al-Bukhari 3905] في صحيحه.');
});

it('leaves text in one script, and ﷺ, word by word', () => {
  expect(bidiRuns('The Prophet ﷺ migrated to Madinah.').every(t => !t.dir)).toBe(true);
  expect(bidiRuns('هاجر النبي ﷺ إلى المدينة.').every(t => !t.dir)).toBe(true);
  expect(bidiRuns('The Prophet ﷺ migrated.').map(t => t.text)).toEqual(['The', 'Prophet', 'ﷺ', 'migrated.']);
});

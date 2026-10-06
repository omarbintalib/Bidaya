import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/data/csv.ts';
import { arabicNumber, normalizeText, spokenDate, toSsml, chunkText, removeQuran, narrationEntries, reserveCharacters } from './narration.mjs';
import { elevenLabsArabicText } from './elevenlabs-text.mjs';
test('chapter ordinals are spoken and each event introduces one primary date', () => {
  assert.equal(normalizeText('الفصل ٢. ١٣ ق.هـ · ٦١٠ م', 'ar'), 'الفصل الثاني. عام ثلاثة عشر قبل الهجرة، عام ستمائة وعشرة للميلاد');
  assert.equal(spokenDate({ year: 0, month: null, ce: 622 }, 'ar'), 'عام الهجرة');
  assert.equal(spokenDate({ year: 2, month: 'رمضان', ce: 624 }, 'en'), 'Ramadan, 2 after the Hijrah');
  assert.equal(spokenDate({ year: null, month: null, ce: 610 }, 'ar'), 'عام ستمائة وعشرة للميلاد');
  assert.equal(spokenDate({ year: null, month: null, ce: 610 }, 'en'), 'the year 610 Common Era');
  assert.equal(spokenDate({ year: null, month: null, ce: null }, 'ar'), '');
  assert.equal(arabicNumber(11), 'أحد عشر'); assert.equal(arabicNumber(610), 'ستمائة وعشرة');
});
test('free-tier reservations cannot exceed the monthly budget and failed attempts remain counted', () => {
  const ledger = { reservedCharacters: 499900 };
  reserveCharacters(ledger, 100, 500000);
  assert.equal(ledger.reservedCharacters, 500000);
  assert.throws(() => reserveCharacters(ledger, 1, 500000), /budget reached/);
  assert.equal(ledger.reservedCharacters, 500000);
});
test('SSML escapes source text, expands honorifics and marks quantities', () => {
  const ssml = toSsml('ﷺ & <قول> ٣٠ رجلاً', 'ar');
  assert.match(ssml, /صلى الله عليه وسلم/); assert.match(ssml, /&amp; &lt;قول&gt;/);
  assert.match(ssml, /<say-as interpret-as="cardinal">30<\/say-as>/);
  assert.match(normalizeText('13–2', 'en'), /from 13 to 2/);
});
test('Quran is omitted while ordinary quoted event dialogue is preserved', () => {
  assert.equal(removeQuran('قبل {آية} بعد', 'ar', 12), 'قبل  بعد');
  assert.equal(removeQuran('{cover me! Cover me!”}', 'en', 12), 'cover me! Cover me!”');
  assert.throws(() => removeQuran('new {unclosed', 'ar', 999), /Unreviewed/);
  assert.equal(removeQuran('حدث {اقتباس غير مغلق', 'ar', 85), 'حدث ');
});
test('chunking preserves full content and stays within the safe size', () => {
  const text = ('Sentence. Another sentence. ').repeat(150).trim();
  const chunks = chunkText(text, 300);
  assert.ok(chunks.every(c => c.length <= 300)); assert.equal(chunks.join(' '), text);
});
test('dash punctuation is never sent to either voice and ranges retain their meaning', () => {
  assert.equal(normalizeText('He — then - met al-Ansar. 13–2', 'en'), 'He then met al Ansar. from 13 to 2');
  assert.equal(normalizeText('قال - ثم — عاد. ٣-٥', 'ar'), 'قال ثم عاد. من 3 إلى 5');
  for (const locale of ['ar', 'en']) assert.ok(!/[-‐‑‒–—―−﹘﹣－]/.test(toSsml('word - word — word ‑ word', locale).replace(/<[^>]*>/g, '')));
});
test('ElevenLabs gets plain Arabic without symbol names, tags or digit pronunciation guesses', () => {
  const text = elevenLabsArabicText('الفصل ٢. قال: «عاد - ثم ﷺ» (٣ رجال) [١] * # < >');
  assert.equal(text, 'الفصل الثاني. قال، عاد ثم صلى الله عليه وسلم ثلاثة رجال');
  assert.ok(!/[\p{S}\[\]{}<>\d—–-]/u.test(text));
});
test('English says the honorific once per event even across chunks and uses Brian-compatible SSML', () => {
  const raw = 'The Prophet ﷺ. ' + ('He ﷺ continued. Peace be upon him. ').repeat(100);
  const prepared = normalizeText(raw, 'en');
  const ssml = chunkText(prepared, 300).map(c => toSsml(c, 'en')).join(' ');
  assert.equal((ssml.match(/peace and blessings be upon him/g) || []).length, 1);
  assert.match(ssml, /en-US-Brian:DragonHDLatestNeural/);
  assert.ok(!ssml.includes('<prosody'));
  assert.equal((normalizeText('ﷺ ﷺ', 'ar').match(/صلى الله عليه وسلم/g) || []).length, 2);
});
test('complete corpus yields 142 events plus four chapters in each language without Quran markers', () => {
  const repo = new URL('../../../data/', import.meta.url);
  const removed = [];
  const entries = narrationEntries(parseCsv(readFileSync(new URL('2_sirah_events.csv', repo), 'utf8')), parseCsv(readFileSync(new URL('12_dorar_titles_and_texts_ar_en.csv', repo), 'utf8')), removed);
  assert.equal(entries.length, 292);
  for (const locale of ['ar', 'en']) assert.equal(entries.filter(e => e.locale === locale && e.id.startsWith('event-')).length, 142);
  assert.ok(removed.length >= 50); assert.ok(entries.every(e => !/[{}﴿﴾]/.test(e.text)));
  assert.ok(!entries.find(e => e.locale === 'ar' && e.id === 'event-20').text.includes('إِنَّنِي أَنَا اللَّهُ'));
  assert.ok(!entries.find(e => e.locale === 'en' && e.id === 'event-75').text.includes('Convey to our people'));
  assert.ok(!entries.find(e => e.locale === 'ar' && e.id === 'event-75').text.includes('بَلِّغوا عَنَّا قَومَنا'));
  for (const e of entries.filter(e => e.kind === 'event')) {
    const source = e.locale === 'ar' ? parseCsv(readFileSync(new URL('2_sirah_events.csv', repo), 'utf8')).find(r => Number(r.dorar_event_number) === e.event.n)['النص'] : parseCsv(readFileSync(new URL('12_dorar_titles_and_texts_ar_en.csv', repo), 'utf8')).find(r => Number(r.dorar_event_number) === e.event.n).text_en_dorar;
    assert.equal(e.sourceBody, source);
    assert.equal(e.body, removeQuran(source, e.locale, e.event.n));
    assert.equal(e.text, `${e.sourceTitle}. ${e.date}. ${e.body}`);
    assert.equal(chunkText(normalizeText(e.text, e.locale)).join(' '), normalizeText(e.text, e.locale));
  }
  for (const e of entries.filter(e => e.kind === 'chapter')) {
    const chapterEvents = entries.filter(v => v.locale === e.locale && v.kind === 'event' && `chapter-${v.event.period}` === e.id);
    assert.deepEqual(e.sourceYears, [chapterEvents[0].event.year, chapterEvents.at(-1).event.year]);
    assert.ok(!e.text.includes(chapterEvents[0].body));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../../../src/data/csv.ts';
import { summaryEntries, SUMMARY_VOICES } from './summary.mjs';
const app = resolve(import.meta.dirname, '../../..');
const csv = name => parseCsv(readFileSync(resolve(app, '../data', name), 'utf8'));
const moments = csv('summary_film.csv'), events = csv('2_sirah_events.csv'), translations = csv('12_dorar_titles_and_texts_ar_en.csv');
test('all 42 summary scripts use the displayed title, year and whole source quote arrays', () => {
  const entries = summaryEntries(moments, events, translations);
  assert.equal(entries.length, 42);
  for (const locale of ['en', 'ar']) {
    const scripts = entries.filter(e => e.locale === locale);
    assert.equal(scripts.length, 21);
    assert.equal(new Set(scripts.map(e => e.id)).size, 21);
    for (const [i, e] of scripts.entries()) {
      const row = moments.find(m => Number(m['رقم_حدث_الدرر']) === e.event);
      assert.deepEqual(e.quotes, row[locale === 'en' ? 'Quotes_EN' : 'المقتطفات'].split('|').map(q => q.trim()).filter(Boolean));
      assert.equal(e.order, i + 1);
      assert.ok(!/[{}﴿﴾<>–—−]/.test(e.text));
      assert.ok(e.path.startsWith(locale + '/summary-event-'));
    }
  }
});
test('source changes cannot silently introduce invented or completed summary passages', () => {
  const altered = moments.map(m => ({ ...m })); altered[0].Quotes_EN += ' This sentence was invented.';
  assert.throws(() => summaryEntries(altered, events, translations), /not verbatim/);
});
test('installed audio and audit match every current summary script and the approved voices', () => {
  const entries = summaryEntries(moments, events, translations);
  const audit = JSON.parse(readFileSync(resolve(app, 'scripts/audio/audits/summary.json'), 'utf8'));
  assert.deepEqual(audit, entries);
  const manifest = JSON.parse(readFileSync(resolve(app, 'public/audio/narration/summary-manifest.json'), 'utf8'));
  for (const e of entries) {
    const index = JSON.parse(readFileSync(resolve(app, `public/audio/narration/summary-${e.locale === 'en' ? 'english' : 'arabic'}-index.json`), 'utf8'));
    const recording = manifest.entries[e.locale + '/' + e.id];
    assert.equal(recording.hash, e.hash); assert.equal(recording.sourceHash, e.sourceHash);
    assert.equal(recording.voice, 'elevenlabs:' + SUMMARY_VOICES[e.locale]);
    const part = index.entries[e.id].parts[0];
    assert.equal(part.path, e.path); assert.equal(part.bytes, readFileSync(resolve(app, 'public/audio/narration', e.path)).length);
    assert.ok(part.duration > 0);
  }
});

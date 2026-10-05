import { beforeAll, describe, expect, it, vi } from 'vitest';
import { answer, suggestFor, sourceLinks } from '../assistant/answer';
import { parseCsv } from './csv';
import { loadSirah } from './load';
import { findPeople, mentionIn } from './people';
import { quranpediaRefs } from './quranpedia';
import { quizPools } from './quiz';
import { versesFor } from './select';
import type { Sirah } from './types';

// Load the real files at the repository root — these tests also catch broken CSV edits.
const files = import.meta.glob<string>(['../../../*.csv', '../../../*.geojson'], { query: '?raw', import: 'default', eager: true });
const byName = new Map(Object.entries(files).map(([path, text]) => [path.split('/').pop()!, text]));
let data: Sirah;
const warnings: string[] = [];

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    const name = decodeURIComponent(url.split('/').pop()!);
    const text = byName.get(name);
    return text === undefined ? new Response('', { status: 404 }) : new Response(text);
  });
  vi.spyOn(console, 'warn').mockImplementation((msg: string) => { warnings.push(msg); });
  data = await loadSirah();
});

describe('csv parser', () => {
  it('handles BOM, quotes, commas and newlines inside fields', () => {
    expect(parseCsv('﻿a,b\n"x, ""y""","line1\nline2"\r\n1,2\n')).toEqual([{ a: 'x, "y"', b: 'line1\nline2' }, { a: '1', b: '2' }]);
  });
});

describe('data package', () => {
  it('loads every file', () => {
    expect(data.events.length).toBeGreaterThan(100);
    expect(data.places.size).toBeGreaterThan(30);
    expect(data.verses.length).toBeGreaterThan(80);
    expect(data.people.length).toBeGreaterThan(50);
    expect(data.routes.filter(r => r.kind === 'sirah')).toHaveLength(16);
    expect(data.routes.some(r => r.kind === 'trade')).toBe(true);
    expect(data.labels.length).toBeGreaterThan(5);
    expect(data.stops.get('event_42')?.map(s => s.name.en)).toEqual(['The cave of Thawr', 'The coastal road (approximate)', 'Quba – Banu Amr ibn Awf']);
    expect(data.quiz.map(q => q.period)).toEqual(['prologue', 'makkah', 'hijrah', 'madinah']);
  });
  it('quotes every quiz answer and route stop verbatim from its Dorar event', () => {
    for (const item of [...data.quiz, ...[...data.stops.values()].flat()]) {
      const e = data.byNumber.get(item.event)!;
      expect(e.text.ar.includes(item.quote) || e.title.ar.includes(item.quote.replace(/\s*\.\s*$/, ''))).toBe(true);
    }
  });
  it('builds more chapter questions from sourced event places', () => {
    const pools = quizPools(data);
    for (const period of ['prologue', 'makkah', 'hijrah', 'madinah'] as const) expect(pools.get(period)!.length).toBeGreaterThan(0);
    for (const q of [...pools.values()].flat()) {
      const e = data.byNumber.get(q.event)!;
      expect(q.options).toContain(q.answer);
      if (q.id.startsWith('E')) {
        expect(new Set(q.options).size).toBe(3);
        expect(e.place).toBe(q.answer);
        expect(e.text.ar.includes(q.quote.replace(/ …$/, ''))).toBe(true);
      }
    }
  });
  it('has no broken references', () => {
    expect(warnings).toEqual([]);
  });
  it('orders events by ترتيب_العرض and keys them by Dorar number', () => {
    const orders = data.events.map(e => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(data.byNumber.get(59)?.title.ar).toContain('بدر');
  });
  it('links verses to their events', () => {
    const ifk = data.byNumber.get(79)!;
    expect(versesFor(data, ifk).direct.map(v => v.ref)).toContain('24:11-20');
  });
});

describe('ask the map (slide 7 test set)', () => {
  it('answers an event question with its source and map position', () => {
    const a = answer(data, 'متى كانت غزوة بدر؟', 'ar');
    expect(a.kind).toBe('event');
    expect(data.byNumber.get(a.event!)?.title.ar).toContain('بدر');
    expect(a.text).toContain('الدرر السنية');
  });
  it('answers a Companion question', () => {
    const a = answer(data, 'من هو أبو بكر الصديق؟', 'ar');
    expect(a.kind).toBe('person');
    expect(a.text).toContain('أبو بكر');
    expect(a.sources?.length).toBeGreaterThan(0);
    expect(a.sources?.every(source => source.url.startsWith('https://'))).toBe(true);
  });
  it('answers a surah question', () => {
    const a = answer(data, 'متى نزلت سورة الأنفال؟', 'ar');
    expect(a.text).toContain('الأنفال');
    expect(a.sources?.some(source => source.url.startsWith('https://quranpedia.net/'))).toBe(true);
  });
  it('answers in English from the same sources', () => {
    const a = answer(data, 'Why did the Prophet migrate to Madinah?', 'en');
    expect(a.kind).toBe('event');
    expect(a.text).toMatch(/Source: Dorar/);
  });
  it('refuses rulings and refers to an official fatwa body', () => {
    expect(answer(data, 'ما حكم صيام يوم السبت؟', 'ar').kind).toBe('refusal');
    expect(answer(data, 'Is it halal to eat this?', 'en').kind).toBe('refusal');
  });
  it('apologises when the sources have nothing', () => {
    expect(answer(data, 'ما لون السيارة؟', 'ar').kind).toBe('none');
  });
});

describe('ask about this event', () => {
  it('only suggests questions the sources answer, about that event', () => {
    for (const locale of ['ar', 'en'] as const) for (const e of data.events) for (const q of suggestFor(data, e, locale)) {
      const a = answer(data, q, locale);
      expect(['person', 'verse']).toContain(a.kind);
      if (a.kind === 'verse') expect(a.event).toBe(e.n);
    }
  });
});

describe('sourced facts about people', () => {
  it('loads every fact in 7_sahaba_references.csv onto its person, with a quote and a source', () => {
    const facts = data.people.flatMap(p => p.facts);
    expect(facts.length).toBe(236);
    expect(data.people.every(p => p.facts.length > 0)).toBe(true);
    for (const f of facts) { expect(f.quote.length).toBeGreaterThan(5); expect(f.source.length).toBeGreaterThan(3); }
  });
});

describe('what the sources say about a person', () => {
  it('quotes the event text word for word', () => {
    let n = 0;
    for (const p of data.people) for (const ev of p.events) for (const lang of ['ar', 'en'] as const) {
      const e = data.byNumber.get(ev);
      const m = e && mentionIn(data, p, e, lang);
      if (!m) continue;
      n++;
      expect((m.lang === 'ar' ? e.text.ar : e.text.en).includes(m.text.replace(/^… /, '').replace(/ …$/, ''))).toBe(true);
    }
    expect(n).toBeGreaterThan(200);
  });
});

describe('quranpedia links', () => {
  it('opens short ranges whole and long ranges at the first ayah', () => {
    expect(quranpediaRefs('2:184-185', false, 'ar').map(r => r.url)).toEqual(['https://quranpedia.net/embed?surah=2&ayah=184-185']);
    expect(quranpediaRefs('8:1-75', false, 'en')[0].url).toBe('https://quranpedia.net/embed?surah=8&ayah=1&type=translations');
    expect(quranpediaRefs('25:68-70; 39:53', false, 'ar').map(r => r.label)).toEqual(['25:68–70', '39:53']);
  });
  it('opens short whole surahs in full', () => {
    expect(quranpediaRefs('108:1-3', true, 'ar')[0].url).toBe('https://quranpedia.net/embed?surah=108&ayah=1-3');
    expect(quranpediaRefs('9:1-129', true, 'ar')[0].url).toBe('https://quranpedia.net/embed?surah=9&ayah=1');
  });
});

describe('companion names in text', () => {
  const names = (text: string, lang: 'ar' | 'en') => findPeople(data, text, lang).map(s => s.person.id);
  it('finds Arabic names across diacritics and أبو / أبي', () => {
    expect(names('هاجر رسولُ الله ومعه أبي بكرٍ الصِّدِّيقِ، وكانت خَديجةُ قد تُوفيت', 'ar')).toEqual(['SAH-001', 'SAH-005']);
    expect(names('وقال عُمَرُ بنُ الخطَّابِ', 'ar')).toEqual(['SAH-002']);
  });
  it('does not link common words or shared first names', () => {
    expect(names('فنزل الوحي على النبي، وبلغ من العُمُر أربعين', 'ar')).toEqual([]);
    expect(names('Muhammad said the same to some of them', 'en')).toEqual([]);
  });
  it("matches Dorar's English spellings", () => {
    expect(names('Aboo Bakr and Khadeejah', 'en')).toEqual(['SAH-001', 'SAH-005']);
    expect(names('‘Umar ibn al-Khattaab', 'en')).toEqual(['SAH-002']);
  });
});
it('attaches structured event sources without reading links from answer prose', () => {
  const result = answer(data, 'When was the Battle of Badr?', 'en');
  expect(result.kind).toBe('event');
  const event = data.byNumber.get(result.event!)!;
  expect(result.sources).toEqual([{ label: 'Dorar', url: event.urlEn || event.url }]);
  expect(answer(data, 'is it halal?', 'en').sources).toBeUndefined();
  expect(sourceLinks([{ label: 'missing', url: '' }, { label: 'unsafe', url: 'javascript:alert(1)' }])).toEqual([]);
});

describe('English, checked against the Arabic', () => {
  const quotes = (s: string) => s.match(/﴿[^﴾]*﴾/g) ?? [];
  it('keeps every Quran quotation in Arabic, exactly as in the Arabic explanation', () => {
    for (const v of data.verses) if (v.reasonEn) expect(quotes(v.reasonEn)).toEqual(quotes(v.reason));
  });
  it('quotes each hadith from a sunnah.com page the record cites', () => {
    const withHadith = data.verses.filter(v => v.hadithEn);
    expect(withHadith.length).toBeGreaterThan(50);
    for (const v of withHadith) {
      expect(v.hadithEn!.url).toMatch(/^https:\/\/sunnah\.com\/(bukhari|muslim):\d+[a-z]?$/);
      const [, book, n] = v.hadithEn!.url.match(/(bukhari|muslim):(\d+)/)!;
      expect(book === 'bukhari' ? v.bukhari.join(' ') : v.muslim.join(' ')).toContain(n);
    }
  });
  it('has an English synopsis and English surah names', () => {
    expect(data.people.every(p => p.bioEn)).toBe(true);
    expect(data.verses.every(v => v.surahEn)).toBe(true);
  });
  it('leaves no Arabic letters in the English it shows', () => {
    const arabic = /[؀-ۿ]/;
    for (const v of data.verses) if (v.reasonEn) expect(arabic.test(v.reasonEn.replace(/﴿[^﴾]*﴾/g, ''))).toBe(false);
    for (const p of data.people) { expect(arabic.test(p.bioEn!.replace(/ﷺ/g, ''))).toBe(false); }
  });
});

describe('spread of Islam on the map', () => {
  const raw = (name: string) => parseCsv(byName.get(name)!);
  const plain = (s: string) => s.replace(/[ً-ْٰـ]/g, '');
  it('quotes the Dorar event for every place and region it lights', () => {
    for (const [file, key] of [['4_places.csv', 'رمز_المكان'], ['map_labels.csv', 'المعرف']] as const) {
      for (const r of raw(file)) {
        const n = Number(r['حدث_بلوغ_الإسلام']);
        if (!n) continue;
        const e = data.byNumber.get(n);
        expect(e, `${file} ${r[key]}`).toBeDefined();
        expect(plain(e!.text.ar), `${file} ${r[key]}`).toContain(plain(r['شاهد_بلوغ_الإسلام']));
      }
    }
  });
  it('reaches every region of Arabia by the end, and not al-Sham, Iraq, Byzantium or Persia', () => {
    const regions = data.labels.filter(l => l.kind !== 'sea');
    const reached = new Set(regions.filter(l => l.reached !== null).map(l => l.id));
    for (const id of ['hijaz', 'tihamah', 'najd', 'yamamah', 'bahrayn', 'yemen', 'oman']) expect(reached.has(id), id).toBe(true);
    for (const id of ['sham', 'iraq', 'rum', 'furs']) expect(reached.has(id), id).toBe(false);
  });
});

describe('letters and delegations on the map', () => {
  const plain = (s: string) => s.replace(/[ً-ْٰـ]/g, '');
  const madinah = (p: { lat: number; lon: number }) => Math.abs(p.lat - 24.4672) < 1e-6 && Math.abs(p.lon - 39.6111) < 1e-6;
  it('loads all twelve, each at a Dorar event', () => {
    expect(data.arcs).toHaveLength(12);
    expect(warnings.filter(w => w.startsWith('map_arcs.csv'))).toEqual([]);
    for (const a of data.arcs) expect(data.byNumber.has(a.event), a.id).toBe(true);
  });
  it('sends every letter from Madinah and brings every delegation to it', () => {
    for (const a of data.arcs) expect(madinah(a.kind === 'letter' ? a.from : a.to), a.id).toBe(true);
  });
  it("quotes Dorar's own words, Arabic and English, where Dorar is the source", () => {
    for (const a of data.arcs.filter(x => x.source.startsWith('الدرر السنية · حدث'))) {
      const n = Number(a.source.replace(/\D+/g, '')), e = data.byNumber.get(n)!;
      expect(n, a.id).toBe(a.event);
      for (const part of a.quote.split(' … ')) expect(plain(e.text.ar), a.id).toContain(plain(part));
      if (a.quoteEn) for (const part of a.quoteEn.split(' … ')) expect(e.text.en, a.id).toContain(part);
    }
  });
  it('links each hadith to its sunnah.com page', () => {
    for (const a of data.arcs.filter(x => x.source.startsWith('صحيح البخاري'))) expect(a.url, a.id).toBe(`https://sunnah.com/bukhari:${a.source.replace(/\D+/g, '')}`);
  });
});

describe('Quran quotations in English', () => {
  it('gives every Quran quotation in the English reasons a Quranpedia translation', () => {
    const missing = data.verses.flatMap(v => [...(v.reasonEn ?? '').matchAll(/﴿([^﴾]*)﴾/g)].filter(m => !v.quranEn.some(q => q.quote === m[1])).map(() => v.id));
    expect(missing).toEqual([]);
  });
  it('links each translation to its Quranpedia page and names the translator', () => {
    for (const v of data.verses) for (const q of v.quranEn) {
      expect(q.url, v.id).toMatch(/^https:\/\/quranpedia\.net\/embed\?surah=\d+&ayah=[\d-]+&type=translations$/);
      expect(q.translator, v.id).toBe('Sahih International');
      expect(q.text.length, v.id).toBeGreaterThan(5);
      expect(q.ayah, v.id).toContain(q.text); // a part is the translation's own words, never reworded
    }
  });
});

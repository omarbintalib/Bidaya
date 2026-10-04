import { beforeAll, describe, expect, it, vi } from 'vitest';
import { answer, suggestFor } from '../assistant/answer';
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
    expect(data.routes.filter(r => r.kind === 'sirah')).toHaveLength(5);
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
  });
  it('answers a surah question', () => {
    const a = answer(data, 'متى نزلت سورة الأنفال؟', 'ar');
    expect(a.text).toContain('الأنفال');
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

describe('English columns filled by the team', () => {
  it('uses an _EN cell once it is filled, and leaves it empty otherwise', async () => {
    expect(data.verses.every(v => v.surahEn === null && v.reasonEn === null)).toBe(true);
    // Simulate a reviewer filling two cells, then load again.
    const fill = (csv: string, col: string, row: string, value: string) => {
      const [head, ...lines] = csv.split('\n'), cols = parseCsv(csv)[0] ? Object.keys(parseCsv(csv)[0]) : [];
      const at = cols.indexOf(col);
      return [head, ...lines.map(l => (l.startsWith(row + ',') ? l.split(',').map((c, i) => (i === at ? value : c)).join(',') : l))].join('\n');
    };
    const surahs = fill(byName.get('1_related_surahs.csv')!, 'السورة_EN', 'ASB-001', 'Al-Alaq');
    vi.stubGlobal('fetch', async (url: string) => {
      const name = decodeURIComponent(url.split('/').pop()!);
      return new Response(name === '1_related_surahs.csv' ? surahs : byName.get(name) ?? '');
    });
    const filled = await loadSirah();
    expect(filled.verses.find(v => v.id === 'ASB-001')?.surahEn).toBe('Al-Alaq');
    // Filled once, used for every row of the same surah; other surahs stay empty.
    const alaq = filled.verses.filter(v => v.surah === 'العلق');
    expect(alaq.every(v => v.surahEn === 'Al-Alaq')).toBe(true);
    expect(filled.verses.filter(v => v.surah !== 'العلق').every(v => v.surahEn === null)).toBe(true);
  });
});

describe('sourced facts about people', () => {
  it('loads every fact in 7_sahaba_references.csv onto its person, with a quote and a source', () => {
    const facts = data.people.flatMap(p => p.facts);
    expect(facts.length).toBe(210);
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

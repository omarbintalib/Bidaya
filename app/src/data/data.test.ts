import { beforeAll, describe, expect, it, vi } from 'vitest';
import { answer } from '../assistant/answer';
import { parseCsv } from './csv';
import { loadSirah } from './load';
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

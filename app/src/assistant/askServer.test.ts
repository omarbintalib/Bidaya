import { describe, expect, it } from 'vitest';
import { askEarly, askServer, warmServer } from './answer';

const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('askServer', () => {
  it('returns the backend answer in the Answer shape', async () => {
    const a = await askServer('متى توفي الرسول', 'ar', reply({
      status: 'answered', kind: 'event', text: 'توفي النبي ﷺ يوم الاثنين.', event: 145,
      sources: [{ label: 'الدرر السنية', url: 'https://dorar.net/history/event/145' }, { label: 'bad', url: 'javascript:alert(1)' }],
    }));
    expect(a).toEqual({ kind: 'event', text: 'توفي النبي ﷺ يوم الاثنين.', event: 145, sources: [{ label: 'الدرر السنية', url: 'https://dorar.net/history/event/145' }] });
  });

  it('passes refusals through without sources', async () => {
    expect(await askServer('هل يجوز', 'ar', reply({ status: 'fatwa', kind: 'refusal', text: 'لا أقدّم فتوى.' }))).toEqual({ kind: 'refusal', text: 'لا أقدّم فتوى.' });
  });

  it('falls back (null) on an error status, a malformed reply or a network failure', async () => {
    expect(await askServer('q', 'en', reply({ kind: 'event', text: 'x' }, false))).toBeNull();
    expect(await askServer('q', 'en', reply({ kind: 'oops', text: 'x' }))).toBeNull();
    expect(await askServer('q', 'en', reply({ kind: 'event', text: '  ' }))).toBeNull();
    expect(await askServer('q', 'en', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe('askEarly', () => {
  it('sends the question once, as soon as it is asked; askServer picks that reply up', async () => {
    const sent: string[] = [];
    const counting = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string).question);
      return { ok: true, json: async () => ({ kind: 'event', text: 'Badr was in 2 AH.', event: 59 }) };
    }) as unknown as typeof fetch;
    askEarly('When was Badr?', 'en', counting);
    expect(sent).toEqual(['When was Badr?']);
    expect(await askServer('When was Badr?', 'en', counting)).toEqual({ kind: 'event', text: 'Badr was in 2 AH.', event: 59 });
    expect(sent).toEqual(['When was Badr?']);
    // Picked up once: asking again sends again.
    await askServer('When was Badr?', 'en', counting);
    expect(sent).toEqual(['When was Badr?', 'When was Badr?']);
  });

  it('is not used for a different question or language', async () => {
    const sent: string[] = [];
    const counting = (async (_url: string, init: RequestInit) => {
      const { question, locale } = JSON.parse(init.body as string);
      sent.push(`${locale}:${question}`);
      return { ok: true, json: async () => ({ kind: 'none', text: question }) };
    }) as unknown as typeof fetch;
    askEarly('When was Badr?', 'en', counting);
    expect((await askServer('When was Uhud?', 'en', counting))?.text).toBe('When was Uhud?');
    askEarly('When was Badr?', 'en', counting);
    expect((await askServer('When was Badr?', 'ar', counting))?.text).toBe('When was Badr?');
    expect(sent).toEqual(['en:When was Badr?', 'en:When was Uhud?', 'en:When was Badr?', 'ar:When was Badr?']);
  });
});

describe('warmServer', () => {
  it('pings the health endpoint next to /api/ask and never throws', async () => {
    const calls: string[] = [];
    warmServer((async (url: string) => { calls.push(url); return { ok: true }; }) as unknown as typeof fetch);
    expect(calls).toEqual(['/api/health']);
    expect(() => warmServer((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).not.toThrow();
  });
});

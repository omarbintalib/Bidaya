import { describe, expect, it } from 'vitest';
import { askServer } from './answer';

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

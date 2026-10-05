// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AnswerActions from './AnswerActions';
import type { Person } from '../data/types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

it('tells apart sources that share a label by their page, and offers the card of the person asked about', async () => {
  const host = document.createElement('div'), root = createRoot(host);
  const person = { id: 'SAH-001', name: { ar: 'أبو بكر الصديق رضي الله عنه', en: 'Abu Bakr al-Siddiq' } } as Person;
  const onPerson = vi.fn();
  await act(async () => root.render(<AnswerActions locale="ar" person={person} onPerson={onPerson} sources={[
    { label: 'الرحيق المختوم: زمن حدوث الإسراء والمعراج', url: 'https://shamela.ws/book/9820/122' },
    { label: 'الرحيق المختوم: زمن حدوث الإسراء والمعراج', url: 'https://shamela.ws/book/9820/125' },
    { label: 'الدرر السنية: الإسراء والمعراج', url: 'https://dorar.net/history/event/32' },
  ]} />));
  const links = [...host.querySelectorAll('a')].map(a => a.textContent);
  expect(links).toEqual(['عرض المصدر · الرحيق المختوم: زمن حدوث الإسراء والمعراج (ص ١٢٢)', 'عرض المصدر · الرحيق المختوم: زمن حدوث الإسراء والمعراج (ص ١٢٥)', 'عرض المصدر · الدرر السنية: الإسراء والمعراج']);
  const button = host.querySelector('button')!;
  expect(button.textContent).toBe('عرض النبذة: أبو بكر الصديق');
  await act(async () => button.click());
  expect(onPerson).toHaveBeenCalledWith(person);
  await act(async () => root.unmount());
});

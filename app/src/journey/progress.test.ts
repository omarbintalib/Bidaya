// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { freshProgress, loadProgress, PROGRESS_KEY } from './progress';
beforeEach(() => localStorage.clear());
it('keeps old quiz results and accepts stable reading IDs', () => {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers: { quiz: 'makkah' }, seen: [12] }));
  expect(loadProgress()).toEqual({ answers: { quiz: 'makkah' }, seen: [12] });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers: { quiz: 'makkah' }, seen: [12], lastEvent: 59 }));
  expect(loadProgress().lastEvent).toBe(59);
  expect(freshProgress()).toEqual({ answers: {}, seen: [] });
});
it('ignores malformed optional progress without dropping valid results', () => {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers: { quiz: 'makkah', bad: 4 }, seen: [12, null, '59'], lastEvent: '59' }));
  expect(loadProgress()).toEqual({ answers: { quiz: 'makkah' }, seen: [12] });
});

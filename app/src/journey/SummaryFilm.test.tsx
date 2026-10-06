// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sirah } from '../data/types';
import SummaryFilm from './SummaryFilm';
const seen = vi.hoisted(() => ({ props: null as null | { entryId: string; previousId: string | null; nextId: string | null; onStarted: () => void; onNext: (() => void) | null; storyPlaying: boolean; locale: string; collection: string } }));
vi.mock('../map/HistoricMap', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./SummaryAsk', () => ({ default: () => null }));
vi.mock('./NarrationPlayer', () => ({ default: (props: NonNullable<typeof seen.props>) => { seen.props = props; return <button onClick={props.onStarted}>Start test narration</button>; } }));
vi.mock('../data/select', async importOriginal => ({ ...await importOriginal<typeof import('../data/select')>(), versesFor: () => ({ direct: [], context: [] }), eventPlaceName: () => 'Makkah' }));
const events = [1, 12, 15].map((n, i) => ({ n, order: i + 1, year: -53 + i, period: 'makkah', title: { en: `Event ${n}`, ar: `حدث ${n}` } }));
const data = { summary: events.map(e => ({ n: e.n, overview: false, quotes: { en: ['Exact English passage.'], ar: ['النص الأصلي.'] } })), byNumber: new Map(events.map(e => [e.n, e])), routes: [] } as unknown as Sirah;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(locale: 'en' | 'ar' = 'en') { await act(async () => root.render(<SummaryFilm data={data} locale={locale} reducedMotion onClose={() => {}} onJump={() => {}} onBeat={() => {}} />)); }
it('maps only summary IDs and pauses timed progression when narration starts', async () => {
  await render(); expect(seen.props?.collection).toBe('summary'); expect(seen.props?.entryId).toBe('summary-event-1');
  expect(seen.props?.previousId).toBeNull(); expect(seen.props?.nextId).toBe('summary-event-12');
  await act(async () => seen.props!.onStarted()); expect(seen.props?.storyPlaying).toBe(false);
  await act(async () => vi.advanceTimersByTime(120000)); expect(seen.props?.entryId).toBe('summary-event-1');
  expect(host.querySelector('#narration-en-summary-event-1')).not.toBeNull();
});
it('continuous listening advances through moments and stops at the final one', async () => {
  await render(); await act(async () => seen.props!.onStarted());
  await act(async () => seen.props!.onNext!()); expect(seen.props?.entryId).toBe('summary-event-12');
  await act(async () => seen.props!.onNext!()); expect(seen.props?.entryId).toBe('summary-event-15');
  expect(seen.props?.nextId).toBeNull(); expect(seen.props?.onNext).toBeNull();
});
it('creates Arabic narration slots and lets sliders consume arrow keys without changing moments', async () => {
  await render('ar'); expect(seen.props?.locale).toBe('ar'); expect(host.querySelector('#narration-ar-summary-event-1')).not.toBeNull();
  const slider = document.createElement('input'); slider.type = 'range'; host.append(slider);
  await act(async () => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(seen.props?.entryId).toBe('summary-event-1');
});

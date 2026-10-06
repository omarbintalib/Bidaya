// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MapTour, { MAP_TOUR_KEY } from './MapTour';
import type { Locale } from '../i18n';

let root: Root, host: HTMLDivElement;
const started = vi.fn();
function Harness({ ready = true, locale = 'en' }: { ready?: boolean; locale?: Locale }) {
  const [open, setOpen] = useState(false);
  return <MapTour ready={ready} locale={locale} open={open} onOpen={() => { started(); setOpen(true); }} onClose={() => setOpen(false)} />;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); started.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); expect(document.body.style.overflow).toBe('');
  host.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function render(ready = true, locale: Locale = 'en') { await act(async () => root.render(<Harness ready={ready} locale={locale} />)); }
async function advance() { await act(async () => vi.advanceTimersByTimeAsync(100)); }
async function click(selector: string) { await act(async () => document.querySelector<HTMLButtonElement>(selector)!.click()); }
const tour = () => document.querySelector<HTMLDialogElement>('.map-tour');

it('waits for readiness, cancels pending starts, and opens once on a first visit', async () => {
  await render(false); await advance(); expect(tour()).toBeNull();
  await render(true); await render(false); await advance(); expect(tour()).toBeNull();
  await render(true); await advance(); expect(tour()?.open).toBe(true); expect(started).toHaveBeenCalledOnce();
  expect(document.body.style.overflow).toBe('hidden'); expect(document.activeElement?.textContent).toBe('Next');
});
it.each(['.map-tour-close', '.map-tour-actions button:first-child', 'escape', 'done'])('remembers dismissal through %s and allows replay', async action => {
  await render(); await advance();
  if (action === 'escape') await act(async () => tour()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  else if (action === 'done') { for (let n = 0; n < 5; n++) await click('.map-tour-actions .btn-primary'); }
  else await click(action);
  expect(tour()).toBeNull(); expect(localStorage.getItem(MAP_TOUR_KEY)).toBe('1');
  expect(document.body.style.overflow).toBe('');
  await act(async () => root.unmount()); root = createRoot(host); await render(); await advance(); expect(tour()).toBeNull();
  await click('.tb-tour'); expect(tour()?.open).toBe(true); expect(tour()?.textContent).toContain('Choose a chapter');
});
it('supports Back, Arabic copy, focus containment and restoration', async () => {
  localStorage.setItem(MAP_TOUR_KEY, '1'); await render();
  host.querySelector<HTMLButtonElement>('.tb-tour')!.focus(); await click('.tb-tour');
  expect(document.querySelector<HTMLButtonElement>('.map-tour-actions button:nth-child(2)')!.disabled).toBe(true);
  await click('.map-tour-actions .btn-primary'); expect(tour()?.textContent).toContain('Follow the story');
  await click('.map-tour-actions button:nth-child(2)'); expect(tour()?.textContent).toContain('Choose a chapter');
  await render(true, 'ar'); expect(tour()?.dir).toBe('rtl'); expect(tour()?.textContent).toContain('اختر فصلًا');
  const close = document.querySelector<HTMLButtonElement>('.map-tour-close')!;
  const next = document.querySelector<HTMLButtonElement>('.map-tour-actions .btn-primary')!;
  await act(async () => { next.focus(); next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(close);
  await act(async () => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(next);
  await click('.map-tour-close'); expect(document.activeElement).toBe(host.querySelector('.tb-tour'));
});
it('remains dismissible and replayable when storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  await render(); await advance(); await click('.map-tour-close'); await render(); await advance(); expect(tour()).toBeNull();
  await click('.tb-tour'); expect(tour()?.open).toBe(true);
});

it('highlights the full chapter and map canvas while excluding the timeline overlay', async () => {
  const targets = document.createElement('div');
  targets.innerHTML = '<div class="scrolly-steps"><section class="step step-chapter is-on"></section></div><div class="scrolly-map"><div class="hmap-frame"></div><div class="story-timeline"></div></div>';
  document.body.append(targets);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const top = this.classList.contains('story-timeline') ? 560 : this.classList.contains('hmap-frame') ? 80 : 100;
    const height = this.classList.contains('story-timeline') ? 120 : this.classList.contains('hmap-frame') ? 600 : 400;
    return { x: 20, y: top, left: 20, right: 420, top, bottom: top + height, width: 400, height, toJSON() {} };
  });
  try {
    await render(); await advance(); await click('.map-tour-actions .btn-primary');
    expect(document.querySelector<HTMLElement>('.map-tour-spot')!.style.height).toBe('412px');
    await click('.map-tour-actions .btn-primary');
    const spot = document.querySelector<HTMLElement>('.map-tour-spot')!;
    expect(spot.style.height).toBe('482px');
    expect(parseFloat(spot.style.top) + parseFloat(spot.style.height)).toBeLessThan(560);
  } finally { targets.remove(); }
});

it('does not offer or show the tour on mobile, and closes it when resizing to mobile', async () => {
  vi.stubGlobal('innerWidth', 390);
  await render(); await advance(); expect(tour()).toBeNull(); expect(host.querySelector('.tb-tour')).toBeNull();
  expect(localStorage.getItem(MAP_TOUR_KEY)).toBeNull();
  vi.stubGlobal('innerWidth', 1280);
  await act(async () => window.dispatchEvent(new Event('resize'))); await advance(); expect(tour()?.open).toBe(true);
  vi.stubGlobal('innerWidth', 390);
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(tour()).toBeNull(); expect(host.querySelector('.tb-tour')).toBeNull(); expect(document.body.style.overflow).toBe('');
});

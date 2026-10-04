// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { sirahFixture } from '../test/sirahFixture';

vi.mock('../data/load', () => ({ getSirah: () => Promise.resolve(sirahFixture) }));
import { defaults, readPreferences, STORAGE_KEY } from './AccessibilityProvider';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  localStorage.clear(); history.replaceState({}, '', '/');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(document.body.style.overflow).toBe('');
  await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0);
  host.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function mount() { await act(async () => root.render(<App />)); await advance(2100); await advance(20); }
async function click(selector: string) { await act(async () => (host.querySelector(selector) as HTMLElement).click()); }
async function open() { await click('.accessibility-launcher'); await advance(20); }
async function select(index: number, value: string) {
  await act(async () => (host.querySelectorAll('[role="combobox"]')[index] as HTMLElement).click());
  await click(`[role="option"][data-value="${value}"]`);
}

it('persists all reading settings, reloads them, and resets them without storing AI data', async () => {
  await mount(); await open();
  for (const [index, value] of ['150','spacious','spacious','dark','plex','reduced'].entries()) await select(index, value);
  for (const input of host.querySelectorAll('input[type="checkbox"]')) await act(async () => (input as HTMLInputElement).click());
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ ...defaults, textSize: 150, lineSpacing: 'spacious', characterSpacing: 'spacious', contrast: 'dark', font: 'plex', motion: 'reduced', highlightLinks: true, strongFocus: true });
  expect(localStorage.length).toBe(2);
  expect(localStorage.getItem('bidaya.locale')).toBe('ar');
  expect(document.documentElement.dataset.readingFont).toBe('plex');
  expect(document.documentElement.dataset.reducedMotion).toBe('true');
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<App />));
  expect(host.querySelector('.logo-transition')?.getAttribute('data-phase')).toBe('crossfade');
  await advance(300); await open();
  expect(host.querySelector('[role="combobox"]')?.getAttribute('data-value')).toBe('150');
  await click('.accessibility-reset');
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(readPreferences()).toEqual(defaults);
  expect(document.documentElement.dataset.contrast).toBe('brand');
});

it('keeps only one dialog open, traps focus, restores the launcher and mirrors with language', async () => {
  await mount(); await click('.destination-trigger'); await advance(20);
  expect(host.querySelector('.accessibility-launcher')).toBeNull();
  await click('.menu-close'); await advance(20);
  await open(); expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.querySelector('.waypoint-menu')).toBeNull();
  const first = host.querySelector('.accessibility-close') as HTMLElement;
  const last = host.querySelector('.accessibility-launcher') as HTMLElement;
  await act(async () => { last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(first);
  await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBe(host.querySelector('.accessibility-launcher'));
  await click('.language-switch'); expect(host.querySelector('.accessibility-launcher')?.getAttribute('dir')).toBe('ltr');
  await open(); expect(host.querySelector('.accessibility-panel h2')?.textContent).toBe('Accessibility');
  await click('.accessibility-backdrop'); expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('closes settings and hides the launcher during history navigation, preserving preferences', async () => {
  await mount(); await open(); await select(0, '125');
  await act(async () => { history.replaceState({}, '', '/journey'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(host.querySelector('.accessibility-panel')).toBeNull();
  expect(host.querySelector('.accessibility-launcher')).toBeNull();
  await advance(2100); await advance(20);
  expect(document.activeElement).toBe(host.querySelector('h1'));
  expect(host.querySelector('.accessibility-launcher')).not.toBeNull();
  expect(readPreferences().textSize).toBe(125);
});

it('validates saved settings and remains usable when storage is unavailable', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 999, contrast: 'unknown', font: 'plex' }));
  expect(readPreferences()).toEqual({ ...defaults, font: 'plex' });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  await mount(); await open(); await select(0, '150');
  expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
  await click('.accessibility-reset');
  expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1');
});

it('operates branded dropdowns with arrow keys and dismisses the popup before the settings dialog', async () => {
  await mount(); await open();
  const combo = host.querySelector<HTMLElement>('[role="combobox"]')!;
  await act(async () => { combo.focus(); combo.click(); });
  expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
  await act(async () => combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await act(async () => combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect(readPreferences().textSize).toBe(125);
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => combo.click());
  await act(async () => combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(host.querySelector('.accessibility-panel')).not.toBeNull();
  expect(document.activeElement).toBe(combo);
});

it('lifts the fixed launcher clear of visible AI content and returns it to the corner', async () => {
  history.replaceState({}, '', '/journey');
  vi.stubGlobal('innerHeight', 400);
  let actorTop = 150;
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('accessibility-launcher')) return new DOMRect(248, 328, 56, 56);
    if (this.classList.contains('mo-actor')) return new DOMRect(24, actorTop, 272, 200);
    return original.call(this);
  });
  await mount();
  await click('.tb-ask'); // "Ask the map" opens from the story toolbar
  (host.querySelector('.mo-actor') as HTMLElement).style.opacity = '1';
  window.dispatchEvent(new Event('resize')); await advance(20);
  expect((host.querySelector('.accessibility-launcher') as HTMLElement).style.getPropertyValue('--launcher-lift')).toBe('246px');
  actorTop = -300;
  window.dispatchEvent(new Event('scroll')); await advance(20);
  expect((host.querySelector('.accessibility-launcher') as HTMLElement).style.getPropertyValue('--launcher-lift')).toBe('0px');
});

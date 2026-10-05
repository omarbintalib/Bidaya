// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PageBoundary } from './Recovery';
import JourneyPage from '../pages/JourneyPage';
import { AccessibilityProvider } from '../accessibility/AccessibilityProvider';
import { sirahFixture } from '../test/sirahFixture';
import { getSirah } from '../data/load';
import FlippingBook from '../landing/FlippingBook';
import LandingTour from '../landing/LandingTour';
vi.mock('../data/load', () => ({ getSirah: vi.fn() }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('offers recovery without exposing technical errors and retries Journey successfully', async () => {
  vi.mocked(getSirah).mockRejectedValueOnce(new Error('private diagnostic')).mockResolvedValueOnce(sirahFixture);
  await act(async () => root.render(<AccessibilityProvider><JourneyPage locale="en" /></AccessibilityProvider>));
  // The Journey's content is its own chunk: wait for it to load.
  await vi.waitFor(() => expect(host.textContent).toContain('Reload page'));
  expect(host.textContent).not.toContain('private diagnostic');
  expect(host.querySelector('.recovery-actions a')?.getAttribute('href')).toBe('/');
  await act(async () => (host.querySelector('.recovery-actions button') as HTMLButtonElement).click());
  expect(getSirah).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.recovery-panel')).toBeNull();
});
it('recovers a crashed page without losing the surrounding interface', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let crash = true;
  function Fragile() { if (crash) throw new Error('technical detail'); return <p>Recovered</p>; }
  await act(async () => root.render(<PageBoundary locale="en"><Fragile /></PageBoundary>));
  expect(host.textContent).not.toContain('technical detail');
  expect(host.textContent).toContain('Try again');
  crash = false;
  await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
  expect(host.textContent).toBe('Recovered');
});

it('replaces failed previews with useful text and allows the other language image to load', async () => {
  const render = (locale: 'ar' | 'en') => <AccessibilityProvider><LandingTour locale={locale} onBegin={() => {}} /></AccessibilityProvider>;
  await act(async () => root.render(render('en')));
  await act(async () => host.querySelector('.landing-preview')!.dispatchEvent(new Event('error')));
  expect(host.querySelector('.landing-preview-fallback')?.textContent).toContain('Explore this scene inside the Journey.');
  await act(async () => root.render(render('ar')));
  expect(host.querySelector('.landing-preview-fallback')).toBeNull();
});

it('stops the book after three flips and does not restart when it returns onscreen', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof visibility) { visibility = callback; }
    observe() {} disconnect() {}
  });
  try {
    await act(async () => root.render(<AccessibilityProvider><FlippingBook /></AccessibilityProvider>));
    await act(async () => visibility([{ isIntersecting: true }]));
    expect(host.querySelector('img')?.src).toContain('.gif');
    await act(async () => vi.advanceTimersByTimeAsync(7800));
    expect(host.querySelector('img')?.src).toContain('.png');
    await act(async () => visibility([{ isIntersecting: false }]));
    await act(async () => visibility([{ isIntersecting: true }]));
    expect(host.querySelector('img')?.src).toContain('.png');
  } finally { vi.useRealTimers(); }
});

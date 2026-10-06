// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { sirahFixture } from '../test/sirahFixture';

vi.mock('../data/load', () => ({ getSirah: () => Promise.resolve(sirahFixture) }));
import { expansionScale } from './LogoTransition';
import { pageFromPath } from './routes';

let root: Root, host: HTMLDivElement;
let reduced = false;
let cancelAnimation: ReturnType<typeof vi.fn>;
let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  cancelAnimation = vi.fn();
  animate = vi.fn(() => ({ cancel: cancelAnimation }));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  localStorage.clear();
  history.replaceState({}, '', '/');
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(document.body.style.overflow).toBe('');
  // jsdom queues a zero-delay selectionchange event when focus is restored.
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
  host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  delete (Element.prototype as Partial<Element>).animate;
  reduced = false;
});

async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function mount(path = '/') {
  history.replaceState({}, '', path);
  await act(async () => root.render(<StrictMode><App /></StrictMode>));
}
async function click(selector: string) { await act(async () => (host.querySelector(selector) as HTMLElement).click()); }
async function openMenu() { await click('.destination-trigger'); await advance(20); }
async function navigate(path: string) { await openMenu(); await click(`.waypoint-menu a[href="${path}"]`); }
async function pop(path: string) {
  await act(async () => {
    history.replaceState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
const phase = () => host.querySelector('.logo-transition')?.getAttribute('data-phase');
const heading = () => host.querySelector('h1');

it('uses distinct real routes and accepts trailing slashes', () => {
  expect(['/','/spread','/journey','/journey/'].map(pageFromPath)).toEqual(['home','journey','journey','journey']);
});

describe('navigation lifecycle', () => {
  it('opens Journey from either landing entry link and keeps the locale through history navigation', async () => {
    reduced = true;
    await mount(); await advance(300); await click('.language-switch');
    const links = host.querySelectorAll<HTMLAnchorElement>('.landing-begin');
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link.getAttribute('href')).toBe('/journey'));
    await click('.landing-overview .landing-begin'); await advance(300);
    expect(location.pathname).toBe('/journey');
    expect(heading()?.textContent).toBe('Islam Journey');
    await pop('/'); await advance(300);
    expect(host.querySelector('#discover-title')?.textContent).toContain('The Sirah');
    await click('.landing-closing .landing-begin'); await advance(300);
    expect(location.pathname).toBe('/journey');
    await pop('/'); await advance(300);
    await pop('/journey'); await advance(300);
    expect(heading()?.textContent).toBe('Islam Journey');
  });

  it('keeps modified landing link clicks native, and the hero link opens Journey directly', async () => {
    reduced = true;
    await mount(); await advance(300);
    let preventedByApp = true;
    const stopJsdomNavigation = (event: Event) => { preventedByApp = event.defaultPrevented; event.preventDefault(); };
    host.addEventListener('click', stopJsdomNavigation);
    await act(async () => host.querySelector('.landing-begin')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })));
    host.removeEventListener('click', stopJsdomNavigation);
    expect(preventedByApp).toBe(false);
    expect(location.pathname).toBe('/');
    expect(phase()).toBeUndefined();
    await click('.explore-link');
    await advance(300);
    expect(location.pathname).toBe('/journey');
    expect(host.querySelector('.waypoint-menu')).toBeNull();
  });

  it('shows 404 for unknown paths and returns home through navigation', async () => {
    reduced = true;
    await mount('/mistyped'); await advance(300);
    expect(pageFromPath('/mistyped')).toBe('not-found');
    expect(location.pathname).toBe('/mistyped');
    expect(heading()?.textContent).toBe('الصفحة غير موجودة');
    await click('.recovery-actions a[href="/"]'); await advance(300);
    expect(location.pathname).toBe('/');
    await pop('/another-missing-page'); await advance(300);
    expect(host.querySelector('.recovery-page')).not.toBeNull();
    await pop('/journey'); await advance(300);
    expect(host.querySelector('.journey-page')).not.toBeNull();
  });

  it('remembers language after remount and defaults to Arabic for invalid preferences', async () => {
    reduced = true;
    await mount(); await advance(300); await click('.language-switch');
    expect(localStorage.getItem('bidaya.locale')).toBe('en');
    await act(async () => root.unmount()); root = createRoot(host);
    await mount(); await advance(300);
    expect(document.documentElement.lang).toBe('en');
    await act(async () => root.unmount()); root = createRoot(host);
    localStorage.setItem('bidaya.locale', 'invalid');
    await mount(); await advance(300);
    expect(document.documentElement.lang).toBe('ar');
  });

  it('moves scroll-link focus to the introduction and respects reduced motion', async () => {
    reduced = true;
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    try {
      await mount(); await advance(300); await click('.landing-scroll');
      expect(document.activeElement).toBe(host.querySelector('#discover'));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
      expect(location.pathname).toBe('/');
    } finally { delete (Element.prototype as Partial<Element>).scrollIntoView; }
  });

  it('uses the header logo to return home through the same cover and reveal sequence', async () => {
    await mount('/journey'); await advance(2100); await click('.language-switch');
    expect(host.querySelector('.brand-home')?.getAttribute('href')).toBe('/');
    expect(host.querySelector('.brand-home')?.getAttribute('aria-label')).toBe('Go to the home page');
    await click('.brand-home'); expect(phase()).toBe('cover');
    expect(location.pathname).toBe('/journey');
    await advance(650); expect(location.pathname).toBe('/'); expect(phase()).toBe('loading');
    await advance(600); expect(phase()).toBe('reveal');
    await advance(850); await advance(20);
    expect(heading()?.textContent).toBe('The beginning');
    expect(document.activeElement).toBe(heading());
    await click('.brand-home'); expect(phase()).toBeUndefined();
  });
  it('plays initial entry and commits each destination only while covered, preserving locale', async () => {
    await mount(); expect(phase()).toBe('cover');
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(true);
    await advance(650); expect(phase()).toBe('loading');
    const sections = host.querySelectorAll('[data-logo-section]');
    expect(sections).toHaveLength(7);
    expect(Number(sections[0].getAttribute('opacity'))).toBeGreaterThan(0);
    expect(sections[6].getAttribute('opacity')).toBe('0');
    sections.forEach(section => expect(section.hasAttribute('transform')).toBe(false));
    await advance(1450); await advance(20); expect(phase()).toBeUndefined();
    expect(document.activeElement).toBe(heading());
    await click('.language-switch');
    for (const [path, name] of [['/journey', 'Islam Journey'], ['/', 'The beginning']]) {
      await navigate(path);
      expect(location.pathname).not.toBe(path);
      expect(phase()).toBe('cover');
      await advance(650);
      expect(location.pathname).toBe(path); expect(heading()?.textContent).toBe(name);
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      await advance(600); expect(phase()).toBe('reveal');
      expect(host.querySelector('.transition-reveal')?.getAttribute('mask')).toMatch(/^url\(#/);
      await advance(850); await advance(20);
      expect(document.activeElement).toBe(heading());
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
    }
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });

  it('supports direct entry at Journey and redirects the old Spread address there', async () => {
    await mount('/journey'); await advance(2100);
    expect(heading()?.textContent).toBe('رحلة الإسلام');
    // The Ask orb is made when its panel first opens.
    expect(host.querySelector('.mo-root')).toBeNull();
    await click('.tb-ask');
    expect(host.querySelector('.mo-root')).not.toBeNull();
    await click('.tb-ask');
    await pop('/'); await advance(2100);
    expect(heading()?.textContent).toBe('البداية');
    expect(host.querySelector('.mo-root')).toBeNull();
    await act(async () => root.unmount()); root = createRoot(host);
    await mount('/spread'); await advance(2100);
    expect(location.pathname).toBe('/journey'); expect(heading()?.textContent).toBe('رحلة الإسلام');
  });

  it('selecting the current route only dismisses the menu and restores the trigger', async () => {
    await mount(); await advance(2100); await openMenu(); await click('.waypoint-menu a[href="/"]');
    expect(phase()).toBeUndefined(); expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('.destination-trigger'));
  });

  it('traps keyboard focus, dismisses with Escape or backdrop, and restores focus', async () => {
    await mount(); await advance(2100); await openMenu();
    const first = host.querySelector('.menu-close') as HTMLElement;
    const last = host.querySelector('.waypoint-menu a[href="/journey"]') as HTMLElement;
    await act(async () => { last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(host.querySelector('.destination-trigger'));
    await openMenu(); await click('.waypoint-backdrop');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('resolves the latest history destination during cover, loading, and reveal', async () => {
    await mount(); await advance(2100);
    await navigate('/journey'); await pop('/'); await advance(650);
    expect(heading()?.textContent).toBe('البداية');
    await pop('/journey'); await advance(600);
    expect(heading()?.textContent).toBe('رحلة الإسلام');
    await pop('/journey'); await pop('/'); await advance(850);
    expect(phase()).toBe('cover'); // latest history request queues a fresh cover
    await advance(2100);
    expect(location.pathname).toBe('/'); expect(heading()?.textContent).toBe('البداية');
    expect(phase()).toBeUndefined();
  });

  it('leaving Journey cancels AI work and returning mounts a fresh demo', async () => {
    await mount('/journey'); await advance(2100);
    await click('.tb-ask');
    const field = host.querySelector<HTMLInputElement>('.ask-panel input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Question in flight');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector('.ask-panel form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await advance(3000); expect(host.querySelector('.mo-root')?.getAttribute('data-phase')).toBe('think');
    await navigate('/'); await advance(2100); await advance(10000);
    expect(host.querySelector('.mo-answer')).toBeNull();
    await navigate('/journey'); await advance(2100);
    await click('.tb-ask');
    expect(host.querySelector('.mo-root')?.getAttribute('data-phase')).toBe('idle');
    expect(host.querySelector<HTMLInputElement>('.ask-panel input')?.value).toBe('');
  });

  it('uses a short crossfade in reduced motion without stroke animations', async () => {
    reduced = true; await mount('/'); expect(phase()).toBe('crossfade');
    await advance(300); expect(phase()).toBeUndefined(); expect(animate).not.toHaveBeenCalled();
    await navigate('/journey'); await advance(300);
    expect(heading()?.textContent).toBe('رحلة الإسلام'); expect(phase()).toBeUndefined();
  });

  it('recovers from animation failure and clears active animation handles on unmount', async () => {
    const setAttribute = Element.prototype.setAttribute;
    let failed = false;
    vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function(this: Element, name, value) {
      if (!failed && name === 'opacity' && this.hasAttribute('data-logo-section') && this.closest('.logo-transition')?.getAttribute('data-phase') === 'loading') { failed = true; throw new Error('Animation failed'); }
      return setAttribute.call(this, name, value);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(); await advance(650); await advance(20);
    expect(phase()).toBeUndefined(); expect(warn).toHaveBeenCalled();
    await navigate('/journey'); await advance(650);
    await act(async () => root.unmount()); root = createRoot(host);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1); expect(vi.getTimerCount()).toBe(0);
  });
});

it.each([[1440,900], [390,844], [3200,300], [300,3200]])('expands solid logo geometry over all corners at %i × %i', (width, height) => {
  const scale = expansionScale(width, height);
  for (const x of [0, width]) for (const y of [0, height]) {
    const sx = (x - width / 2) / scale + 703.5;
    const sy = (y - height / 2) / scale + 293.5;
    expect(sx).toBeGreaterThan(650); expect(sx).toBeLessThan(753);
    expect(sy).toBeGreaterThan(220); expect(sy).toBeLessThan(468);
  }
});

it('offers resume by stable event ID and resets progress while keeping chats', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  localStorage.setItem('bidaya.locale', 'en');
  localStorage.setItem('bidaya.journey.v1', JSON.stringify({ answers: { old: 'makkah' }, seen: [12, 59], lastEvent: 59 }));
  const chats = [{ id: 1, question: 'Where?', answer: 'Makkah', locale: 'en' }];
  localStorage.setItem('bidaya.chats.v1', JSON.stringify(chats));
  await mount('/journey'); await advance(2100);
  expect(host.querySelector('.resume-dialog')?.textContent).toContain('quiz results');
  await click('.resume-dialog .btn-primary'); await advance(20);
  expect(host.querySelector('.step-event.is-on h2')?.textContent).toBe('Event 59');
  expect(JSON.parse(localStorage.getItem('bidaya.journey.v1')!).answers).toEqual({ old: 'makkah' });
  await act(async () => root.unmount()); root = createRoot(host);
  await mount('/journey'); await advance(2100);
  await click('.resume-dialog .btn-quiet:last-child'); await advance(20); // Start over
  expect(JSON.parse(localStorage.getItem('bidaya.journey.v1')!)).toEqual({ answers: {}, seen: [] });
  expect(JSON.parse(localStorage.getItem('bidaya.chats.v1')!)).toEqual(chats);
});
it('keeps old quiz results when the saved reading event is missing', async () => {
  const saved = { answers: { old: 'makkah' }, seen: [12], lastEvent: 999999 };
  localStorage.setItem('bidaya.journey.v1', JSON.stringify(saved));
  await mount('/journey'); await advance(2100);
  expect(host.querySelector('.resume-dialog')).toBeNull();
  expect(JSON.parse(localStorage.getItem('bidaya.journey.v1')!).answers).toEqual(saved.answers);
});

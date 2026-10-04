// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Locale } from '../i18n';
import { useLanguageSwitch } from './useLanguageSwitch';

let root: Root, host: HTMLDivElement;
let updates: (() => Promise<void>)[];
let finishes: (() => void)[];
let skips: ReturnType<typeof vi.fn>[];
let start: ReturnType<typeof vi.fn>;
function Harness({ reduced = false }: { reduced?: boolean }) {
  const [locale, setLocale] = useState<Locale>('ar');
  const toggle = useLanguageSwitch(locale, setLocale, reduced);
  return <button onClick={toggle}>{locale}</button>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updates = []; finishes = []; skips = [];
  start = vi.fn((update: () => Promise<void>) => {
    updates.push(update);
    const skipTransition = vi.fn(); skips.push(skipTransition);
    return { skipTransition, ready: Promise.resolve(), finished: new Promise<void>(resolve => finishes.push(resolve)) };
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  finishes.forEach(finish => finish());
  host.remove();
  delete (document as Partial<Document>).startViewTransition;
  delete document.documentElement.dataset.languageSweep;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function click() { await act(async () => host.querySelector('button')!.click()); }

it('sets the sweep direction, commits translation in the snapshot callback, and cleans up', async () => {
  await act(async () => root.render(<Harness />));
  await click();
  expect(document.documentElement.dataset.languageSweep).toBe('en');
  expect(host.textContent).toBe('ar');
  await act(async () => updates[0]());
  expect(host.textContent).toBe('en');
  await act(async () => finishes[0]());
  expect(document.documentElement.dataset.languageSweep).toBeUndefined();
  await click();
  expect(document.documentElement.dataset.languageSweep).toBe('ar');
  await act(async () => updates[1]());
  expect(host.textContent).toBe('ar');
});

it('keeps the latest intent when skipped transition callbacks finish out of order', async () => {
  await act(async () => root.render(<Harness />));
  await click(); await click(); await click();
  expect(skips[0]).toHaveBeenCalledOnce();
  expect(skips[1]).toHaveBeenCalledOnce();
  await act(async () => updates[2]());
  await act(async () => { await updates[1](); await updates[0](); finishes[0](); });
  expect(host.textContent).toBe('en');
  expect(document.documentElement.dataset.languageSweep).toBe('en');
  await act(async () => finishes[2]());
  expect(document.documentElement.dataset.languageSweep).toBeUndefined();
});

it('switches immediately with reduced motion and skips a running transition if preferences change', async () => {
  await act(async () => root.render(<Harness reduced />));
  await click();
  expect(host.textContent).toBe('en');
  expect(start).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness />));
  await click();
  await act(async () => root.render(<Harness reduced />));
  expect(skips[0]).toHaveBeenCalledOnce();
  await act(async () => updates[0]());
  expect(host.textContent).toBe('ar');
  expect(document.documentElement.dataset.languageSweep).toBeUndefined();
});

it('still changes language when snapshot creation fails', async () => {
  start.mockImplementation(() => { throw new Error('Snapshot unavailable'); });
  await act(async () => root.render(<Harness />));
  await click();
  expect(host.textContent).toBe('en');
  expect(document.documentElement.dataset.languageSweep).toBeUndefined();
});

it('prevents a delayed update from running after unmount', async () => {
  await act(async () => root.render(<Harness />));
  await click();
  await act(async () => root.unmount());
  root = createRoot(host);
  expect(skips[0]).toHaveBeenCalledOnce();
  await act(async () => updates[0]());
  expect(host.textContent).toBe('');
  expect(document.documentElement.dataset.languageSweep).toBeUndefined();
});

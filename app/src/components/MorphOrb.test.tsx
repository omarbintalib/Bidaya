// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MorphOrb from './MorphOrb';
import { copy } from '../i18n';

let host: HTMLDivElement;
let root: Root;
let reduced = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  reduced = false;
});

async function input(text: string) {
  const field = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
const phase = () => host.querySelector('.mo-root')!.getAttribute('data-phase');

it('runs the response-only animation once in Strict Mode without showing another input', async () => {
  const onSubmit = vi.fn(() => 'A sourced answer');
  await act(async () => root.render(<StrictMode><MorphOrb docked request={{ id: 1, text: 'Question' }} locale="en" onSubmit={onSubmit} minThinkMs={0} speed={2} /></StrictMode>));
  expect(host.querySelector('form')?.hidden).toBe(true);
  await advance(6000);
  expect(phase()).toBe('answered');
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(host.querySelector('.mo-a-body')?.textContent).toContain('A sourced answer');
});

it('opens history from the icon without submitting the typed question', async () => {
  const history = vi.fn(), onSubmit = vi.fn();
  await act(async () => root.render(<MorphOrb locale="en" onHistory={history} onSubmit={onSubmit} />));
  await input('Keep this draft');
  await act(async () => (host.querySelector('.mo-history') as HTMLButtonElement).click());
  expect(history).toHaveBeenCalledOnce();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(host.querySelector('input')?.value).toBe('Keep this draft');
});

describe('MorphOrb interaction lifecycle', () => {
  it('rejects blank questions and completes two questions with focus restored between them', async () => {
    const onSubmit = vi.fn(() => 'A sample answer');
    await act(async () => root.render(<MorphOrb locale="en" onSubmit={onSubmit} minThinkMs={0} speed={2} />));
    await submit();
    expect(phase()).toBe('idle');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(copy.en.ai.empty);
    for (const question of ['First question', 'Second question']) {
      await input(question);
      await submit();
      await submit(); // programmatic duplicate still cannot start another request
      expect(host.querySelector('form')?.hasAttribute('inert')).toBe(true);
      await advance(6000);
      expect(phase()).toBe('answered');
      expect(document.activeElement).toBe(host.querySelector('.mo-answer'));
      await act(async () => (host.querySelector('.mo-reset') as HTMLButtonElement).click());
      await advance(1000);
      expect(phase()).toBe('idle');
      expect(document.activeElement).toBe(host.querySelector('input'));
      expect(host.querySelector('input')?.value).toBe('');
    }
    expect(onSubmit.mock.calls).toEqual([['First question'], ['Second question']]);
  });

  it('ignores a late response after Escape and accepts a fresh question', async () => {
    let finish!: (answer: string) => void;
    const onSubmit = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    await act(async () => root.render(<MorphOrb locale="en" onSubmit={onSubmit} minThinkMs={0} speed={2} />));
    await input('Cancelled question'); await submit(); await advance(1500);
    expect(phase()).toBe('think');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await advance(1000);
    await act(async () => finish('This obsolete answer must not appear'));
    await advance(3000);
    expect(phase()).toBe('idle');
    expect(host.textContent).not.toContain('obsolete');
    await input('New question'); await submit(); await advance(1500);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('uses the reduced-motion sequence and translates the answer when locale changes', async () => {
    reduced = true;
    await act(async () => root.render(<MorphOrb locale="ar" minThinkMs={0} speed={2} />));
    await input('سؤال'); await submit(); await advance(1800);
    expect(phase()).toBe('answered');
    expect(host.querySelector('.mo-a-body')?.textContent).toContain('هنا ستظهر');
    await act(async () => root.render(<MorphOrb locale="en" minThinkMs={0} speed={2} />));
    expect(host.querySelector('.mo-a-body')?.textContent).toContain('Your answer will appear here');
    expect(host.querySelector('[role="status"]')?.textContent).toBe(copy.en.ai.answerReady + copy.en.ai.answerBody);
  });

  it('clears all animation and status timers when unmounted mid-processing', async () => {
    await act(async () => root.render(<MorphOrb onSubmit={() => new Promise(() => {})} speed={2} />));
    await input('Pending question'); await submit(); await advance(1500);
    expect(phase()).toBe('think');
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(vi.getTimerCount()).toBe(0);
  });
});


it('preserves a pending question when motion and typography change, and measures the answer height', async () => {
  let finish!: (answer: string) => void;
  const onSubmit = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('mo-measure')) return { x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 292, width: 360, height: 292, toJSON() {} };
    return original.call(this);
  });
  await act(async () => root.render(<MorphOrb locale="en" onSubmit={onSubmit} minThinkMs={0} speed={2} reducedMotion={false} />));
  await input('Keep my question'); await submit(); await advance(1500);
  expect(phase()).toBe('think');
  await act(async () => {
    root.render(<MorphOrb locale="en" onSubmit={onSubmit} minThinkMs={0} speed={2} reducedMotion />);
    document.documentElement.style.setProperty('--text-scale', '1.5');
    document.documentElement.dataset.lineSpacing = 'spacious';
  });
  expect(host.querySelector('input')?.value).toBe('Keep my question');
  expect(phase()).toBe('think'); expect(onSubmit).toHaveBeenCalledTimes(1);
  await act(async () => finish('An answer that needs more room.'));
  await advance(1800);
  expect(phase()).toBe('answered');
  expect(host.querySelector<HTMLElement>('.mo-root')?.style.getPropertyValue('--answer-height')).toBe('292px');
  expect(host.querySelector<HTMLElement>('.mo-actor')?.style.getPropertyValue('--h')).toBe('292px');
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('keeps resize measurements from snapping the card during the globe-to-answer morph', async () => {
  const observers: (() => void)[] = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { observers.push(callback); } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return this.classList.contains('mo-measure') ? new DOMRect(0, 0, 440, 292) : original.call(this);
  });
  await act(async () => root.render(<MorphOrb locale="en" minThinkMs={0} onSubmit={() => 'A smoothly unfolding answer'} />));
  await input('Question'); await submit();
  for (let frame = 0; frame < 400 && phase() !== 'unfold'; frame++) await advance(16);
  expect(phase()).toBe('unfold');
  await advance(180);
  const actor = host.querySelector<HTMLElement>('.mo-actor')!;
  const mover = host.querySelector<HTMLElement>('.mo-mover')!;
  const width = actor.style.getPropertyValue('--w');
  const height = actor.style.getPropertyValue('--h');
  expect(parseFloat(width)).toBeGreaterThan(124); expect(parseFloat(width)).toBeLessThan(440);
  expect(parseFloat(mover.style.top)).toBeGreaterThan(100); expect(parseFloat(mover.style.top)).toBeLessThan(166);
  await act(async () => observers.forEach(callback => callback()));
  expect(actor.style.getPropertyValue('--w')).toBe(width);
  expect(actor.style.getPropertyValue('--h')).toBe(height);
  await advance(1500);
  expect(phase()).toBe('answered');
  expect(actor.style.getPropertyValue('--h')).toBe('292px');
  expect(mover.style.top).toBe('166px');
});

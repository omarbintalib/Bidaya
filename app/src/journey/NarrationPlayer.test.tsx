// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import NarrationPlayer from './NarrationPlayer';
let host: HTMLDivElement, root: Root;
const manifest = { version: 1, entries: {
  'ar/event-12': { voice: 'ar-KW-FahedNeural', hash: 'a', parts: ['ar/12-1.mp3', 'ar/12-2.mp3'] },
  'ar/event-13': { voice: 'ar-KW-FahedNeural', hash: 'b', parts: ['ar/13-1.mp3'] },
  'en/event-12': { voice: 'en-US-DavisMultilingualNeural', hash: 'c', parts: ['en/12-1.mp3'] },
} };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }));
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = async (id: string | null, locale: 'ar' | 'en' = 'ar', next: (() => void) | null = null) => {
  await act(async () => root.render(<NarrationPlayer entryId={id} locale={locale} onStarted={() => {}} storyPlaying={false} onNext={next} />));
};
it('loads only the static manifest, never synthesizes at playback time', async () => {
  await render('event-12');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('audio/narration/manifest.json');
  expect(host.querySelector('audio')?.getAttribute('src')).toContain('ar/12-1.mp3');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it('plays the next chunk then advances only when continuous reading is enabled', async () => {
  const next = vi.fn(); await render('event-12', 'ar', next);
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  expect(host.querySelector('audio')?.getAttribute('src')).toContain('12-2.mp3');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  expect(next).not.toHaveBeenCalled();
  await act(async () => (host.querySelector('input') as HTMLInputElement).click());
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  expect(next).toHaveBeenCalledOnce();
  await render('event-13');
  expect(host.querySelector('audio')?.getAttribute('src')).toContain('13-1.mp3');
});
it('manual navigation and language changes start paused on the first chunk', async () => {
  await render('event-12');
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  vi.mocked(HTMLMediaElement.prototype.play).mockClear();
  await render('event-13');
  expect(host.querySelector('audio')?.getAttribute('src')).toContain('13-1.mp3');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  await render('event-12', 'en');
  expect(host.querySelector('audio')?.getAttribute('src')).toContain('en/12-1.mp3');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it('scrolling pauses narration and quiz steps have no audio', async () => {
  await render('event-12');
  vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
  await act(async () => window.dispatchEvent(new Event('wheel')));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await render(null); expect(host.querySelector('audio')).toBeNull();
});
it('missing files show unavailable and playback failures show a readable error', async () => {
  await render('event-999'); expect(host.textContent).toContain('غير متاح');
  await render('event-12');
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('error')));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('تعذر تشغيل');
});

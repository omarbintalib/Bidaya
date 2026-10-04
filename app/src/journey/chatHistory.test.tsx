// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHAT_KEY, readChats, useChatHistory } from './chatHistory';
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); host = document.createElement('div'); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Harness() {
  const { chats, remember, clear } = useChatHistory();
  return <><button onClick={() => remember({ id: 1, question: 'Where?', answer: 'Makkah', locale: 'en' })}>Save</button><button onClick={clear}>Clear</button><p>{chats.map(chat => chat.answer).join(',')}</p></>;
}
it('persists answers and clears saved chats', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => host.querySelector('button')!.click());
  expect(readChats()[0].answer).toBe('Makkah');
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<Harness />));
  expect(host.querySelector('p')?.textContent).toBe('Makkah');
  await act(async () => host.querySelectorAll('button')[1].click());
  expect(localStorage.getItem(CHAT_KEY)).toBeNull();
});
it('handles malformed history and unavailable storage without losing the current answer', async () => {
  localStorage.setItem(CHAT_KEY, '[{"id":1,"answer":"incomplete"}]');
  expect(readChats()).toEqual([]);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  await act(async () => root.render(<Harness />));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('p')?.textContent).toBe('Makkah');
});

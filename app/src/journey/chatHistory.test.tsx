// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHAT_KEY, readChats, useChatHistory } from './chatHistory';
import ChatHistory from './ChatHistoryPanel';
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
it('accepts legacy records and strips unsafe optional references', () => {
  const old = { id: 1, question: 'Where?', answer: 'Makkah', locale: 'en' };
  localStorage.setItem(CHAT_KEY, JSON.stringify([old, { ...old, id: 2, createdAt: 1000, event: 12, sources: [{ label: 'Dorar', url: 'https://dorar.net/history/event/12' }, { label: 'bad', url: 'javascript:alert(1)' }, null] }]));
  expect(readChats()[0]).toEqual(old);
  expect(readChats()[1].sources).toEqual([{ label: 'Dorar', url: 'https://dorar.net/history/event/12' }]);
  expect(readChats()[1].createdAt).toBe(1000);
});
it('searches answers, dates only new records, deletes one chat, and handles clipboard failure', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  const remove = vi.fn();
  await act(async () => root.render(<ChatHistory locale="en" chats={[{ id: 2, question: 'New', answer: 'Medina', locale: 'en', createdAt: 1000 }, { id: 1, question: 'Old', answer: 'Makkah', locale: 'en' }]} onClear={() => {}} onClose={() => {}} onDelete={remove} onEvent={() => {}} mapEvents={new Set()} />));
  expect(host.querySelectorAll('time')).toHaveLength(1);
  const input = host.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Makkah'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(host.querySelectorAll('li')).toHaveLength(1);
  expect(host.querySelector('h3')?.textContent).toBe('Old');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Copy answer')!.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Select the answer text');
  expect(host.querySelector('.chat-answer')?.textContent).toBe('Makkah');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Delete chat')!.click());
  expect(remove).toHaveBeenCalledWith(1);
});

import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../i18n';

export interface ChatEntry { id: number; question: string; answer: string; locale: Locale }
export const CHAT_KEY = 'bidaya.chats.v1';
const LIMIT = 50;
export function readChats(): ChatEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ChatEntry => item && typeof item.id === 'number' && Number.isFinite(item.id)
      && typeof item.question === 'string' && item.question.length > 0 && item.question.length <= 4000
      && typeof item.answer === 'string' && item.answer.length > 0 && item.answer.length <= 50000
      && (item.locale === 'ar' || item.locale === 'en')).slice(0, LIMIT);
  } catch { return []; }
}
export function useChatHistory() {
  const [chats, setChats] = useState(readChats);
  useEffect(() => { try { if (chats.length) localStorage.setItem(CHAT_KEY, JSON.stringify(chats)); else localStorage.removeItem(CHAT_KEY); } catch { /* Keep history in memory when storage is unavailable. */ } }, [chats]);
  const remember = useCallback((entry: ChatEntry) => setChats(previous => [entry, ...previous.filter(item => item.id !== entry.id)].slice(0, LIMIT)), []);
  const clear = useCallback(() => setChats([]), []);
  return { chats, remember, clear };
}

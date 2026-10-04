export const PROGRESS_KEY = 'bidaya.journey.v1';
export interface Progress { answers: Record<string, string>; seen: number[]; lastEvent?: number }
export const freshProgress = (): Progress => ({ answers: {}, seen: [] });
export function loadProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return freshProgress();
    return {
      answers: value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers) ? Object.fromEntries(Object.entries(value.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
      seen: Array.isArray(value.seen) ? value.seen.filter((n: unknown) => typeof n === 'number' && Number.isSafeInteger(n)) : [],
      ...(Number.isSafeInteger(value.lastEvent) ? { lastEvent: value.lastEvent } : {}),
    };
  } catch { return freshProgress(); }
}

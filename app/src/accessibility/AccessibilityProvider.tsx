import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export type Preferences = {
  textSize: 100 | 125 | 150;
  lineSpacing: 'standard' | 'spacious';
  characterSpacing: 'standard' | 'spacious';
  contrast: 'brand' | 'light' | 'dark';
  font: 'saudi' | 'plex';
  motion: 'system' | 'reduced';
  highlightLinks: boolean;
  strongFocus: boolean;
};
export const STORAGE_KEY = 'islamathon.accessibility.v1';
export const defaults: Preferences = { textSize: 100, lineSpacing: 'standard', characterSpacing: 'standard', contrast: 'brand', font: 'saudi', motion: 'system', highlightLinks: false, strongFocus: false };
export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!saved || typeof saved !== 'object') return { ...defaults };
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof Preferences)[]) {
      const allowed: Record<keyof Preferences, unknown[]> = { textSize: [100,125,150], lineSpacing: ['standard','spacious'], characterSpacing: ['standard','spacious'], contrast: ['brand','light','dark'], font: ['saudi','plex'], motion: ['system','reduced'], highlightLinks: [false,true], strongFocus: [false,true] };
      if (allowed[key].includes(saved[key])) Object.assign(result, { [key]: saved[key] });
    }
    return result;
  } catch { return { ...defaults }; }
}

type Context = { preferences: Preferences; reducedMotion: boolean; update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void; reset: () => void };
const AccessibilityContext = createContext<Context | null>(null);
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = systemReduced || preferences.motion === 'reduced';
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(preferences.textSize / 100));
    root.dataset.contrast = preferences.contrast;
    root.dataset.readingFont = preferences.font;
    root.dataset.lineSpacing = preferences.lineSpacing;
    root.dataset.characterSpacing = preferences.characterSpacing;
    root.dataset.reducedMotion = String(reducedMotion);
    root.dataset.highlightLinks = String(preferences.highlightLinks);
    root.dataset.strongFocus = String(preferences.strongFocus);
  }, [preferences, reducedMotion]);
  const update: Context['update'] = (key, value) => setPreferences(previous => {
    const next = { ...previous, [key]: value };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Preferences remain usable in memory. */ }
    return next;
  });
  const reset = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Memory reset still works. */ }
    setPreferences({ ...defaults });
  };
  return <AccessibilityContext.Provider value={{ preferences, reducedMotion, update, reset }}>{children}</AccessibilityContext.Provider>;
}
export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error('AccessibilityProvider is required');
  return context;
}

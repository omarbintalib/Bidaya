import { useSyncExternalStore } from 'react';

export const NARRATION_SPEED_KEY = 'bidaya.narration.speed';
export const NARRATION_SPEEDS = [.75, 1, 1.25, 1.5];
let memorySpeed = 1;
let unsaved = false;
const listeners = new Set<() => void>();

function readSpeed() {
  if (unsaved) return memorySpeed;
  try {
    const saved = Number(localStorage.getItem(NARRATION_SPEED_KEY));
    memorySpeed = NARRATION_SPEEDS.includes(saved) ? saved : 1;
  } catch { /* Keep the preference in memory when storage is unavailable. */ }
  return memorySpeed;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key === NARRATION_SPEED_KEY || event.key === null) { unsaved = false; listener(); }
  };
  window.addEventListener('storage', changed);
  return () => { listeners.delete(listener); window.removeEventListener('storage', changed); };
}

function setSpeed(value: number) {
  if (!NARRATION_SPEEDS.includes(value)) return;
  memorySpeed = value;
  try { localStorage.setItem(NARRATION_SPEED_KEY, String(value)); unsaved = false; } catch { unsaved = true; }
  listeners.forEach(listener => listener());
}

export function useNarrationSpeed() {
  return [useSyncExternalStore(subscribe, readSpeed, () => 1), setSpeed] as const;
}

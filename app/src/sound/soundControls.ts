import { useSyncExternalStore } from 'react';

/**
 * The Journey's background sound, offered in the settings panel (AccessibilityPanel) while the Journey is open:
 * the Journey owns the sound and publishes its switch, volume and labels here; the panel shows them when present.
 */
export interface SoundControls {
  on: boolean; volume: number; toggle: () => void; setVolume: (v: number) => void;
  labels: { title: string; on: string; volume: string; note: string };
}

let current: SoundControls | null = null;
const listeners = new Set<() => void>();

export function publishSound(controls: SoundControls | null) {
  current = controls;
  listeners.forEach(l => l());
}

export function useSoundControls() {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => null);
}

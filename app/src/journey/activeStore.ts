import { useSyncExternalStore } from 'react';

/**
 * The current step, shared without re-rendering long lists: each step (or timeline tick) subscribes with a
 * selector, so moving one step re-renders only the items whose answer to the selector changed.
 */
export function createActiveStore(initial: number) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: number) {
      if (next === value) return;
      value = next;
      listeners.forEach(l => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
export type ActiveStore = ReturnType<typeof createActiveStore>;

export function useActive<T>(store: ActiveStore, select: (active: number) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}

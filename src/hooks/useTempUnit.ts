import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type TempUnit = 'F' | 'C';

const STORAGE_KEY = 'sf-sky:tempUnit';
const DEFAULT_UNIT: TempUnit = 'F';

function readStoredUnit(): TempUnit {
  if (typeof window === 'undefined') return DEFAULT_UNIT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'C' || raw === 'F' ? raw : DEFAULT_UNIT;
  } catch {
    return DEFAULT_UNIT;
  }
}

// Module-level subscriber set so all hook instances in the same tab stay in sync.
const listeners = new Set<() => void>();
let snapshot: TempUnit = readStoredUnit();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: TempUnit) {
  if (next === snapshot) return;
  snapshot = next;
  try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
  listeners.forEach((cb) => cb());
}

/**
 * Persisted Fahrenheit/Celsius preference. All hook instances on the page
 * share one source of truth so toggling in ScoreCard immediately updates
 * ScorePanel, SearchOverlay, etc.
 */
export function useTempUnit(): [TempUnit, (next: TempUnit) => void] {
  const unit = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_UNIT);

  // Cross-tab sync via storage events.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'C' || e.newValue === 'F') {
        setSnapshot(e.newValue);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const update = useCallback((next: TempUnit) => setSnapshot(next), []);
  return [unit, update];
}

/** Convert a Fahrenheit temperature to the requested display unit. */
export function convertTempF(tempF: number, unit: TempUnit): number {
  switch (unit) {
    case 'F':
      return tempF;
    case 'C':
      return (tempF - 32) * (5 / 9);
  }
}

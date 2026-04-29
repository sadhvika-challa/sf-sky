import { useCallback, useEffect, useState } from 'react';

export type TempUnit = 'F' | 'C';

const STORAGE_KEY = 'sf-sky:tempUnit';
const DEFAULT_UNIT: TempUnit = 'F';

function readStoredUnit(): TempUnit {
  if (typeof window === 'undefined') return DEFAULT_UNIT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'C' || raw === 'F' ? raw : DEFAULT_UNIT;
  } catch {
    // localStorage can throw in private mode / disabled storage — fall back
    // to the default rather than blowing up the render.
    return DEFAULT_UNIT;
  }
}

/**
 * Persisted Fahrenheit/Celsius preference. Reads on mount, writes on
 * every change, and listens to `storage` events so multiple open tabs
 * stay in sync when the user flips the unit.
 */
export function useTempUnit(): [TempUnit, (next: TempUnit) => void] {
  const [unit, setUnit] = useState<TempUnit>(() => readStoredUnit());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, unit);
    } catch {
      // Same rationale as readStoredUnit — never let a storage error break
      // the UI; the in-memory state still works for this session.
    }
  }, [unit]);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'C' || e.newValue === 'F') {
        setUnit(e.newValue);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const update = useCallback((next: TempUnit) => setUnit(next), []);
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

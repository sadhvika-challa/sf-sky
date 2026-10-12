import { describe, expect, it } from 'vitest';
import { createBrowserKeyValueStore } from '../../platform/storage';
import { addPrivateSpots, forecastCoordinates, isPrivateSpot, parsePrivateSpots, PRIVATE_SPOTS_STORAGE_KEY, type PrivateSpot } from '../privateSpots';
import { allSpots } from '../../data/all-spots';

const roof: PrivateSpot = {
  id: 'private:test-roof', name: 'Test Roof', city: 'sf', visibility: 'private',
  lat: 37.78123, lng: -122.45123, category: 'skyscraper', elevation: 0,
  lightPollution: 'High', horizonQuality: 'Partial', sunrise: 60, sunset: 30, stargazing: 20,
};

function memoryStore() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
  return createBrowserKeyValueStore(() => storage);
}

describe('Private spots', () => {
  it('persists only in device storage and leaves the public catalog unchanged', async () => {
    const store = memoryStore();
    await addPrivateSpots(store, [roof]);
    expect(parsePrivateSpots(await store.get(PRIVATE_SPOTS_STORAGE_KEY))).toEqual([roof]);
    expect(allSpots.some((spot) => spot.id === roof.id || spot.visibility === 'private')).toBe(false);
  });
  it('imports once without duplicating or replacing device edits', async () => {
    const store = memoryStore();
    await addPrivateSpots(store, [{ ...roof, name: 'Edited roof' }]);
    await addPrivateSpots(store, [roof]);
    expect(parsePrivateSpots(await store.get(PRIVATE_SPOTS_STORAGE_KEY))).toEqual([{ ...roof, name: 'Edited roof' }]);
  });
  it('rejects invalid records and preserves unknown storage versions', async () => {
    const store = memoryStore();
    const newer = JSON.stringify({ version: 2, spots: [roof] });
    await store.set(PRIVATE_SPOTS_STORAGE_KEY, newer);
    await expect(addPrivateSpots(store, [roof])).rejects.toThrow('Stored data was preserved');
    expect(await store.get(PRIVATE_SPOTS_STORAGE_KEY)).toBe(newer);
    expect(isPrivateSpot({ ...roof, visibility: undefined })).toBe(false);
    expect(isPrivateSpot({ ...roof, lat: 100 })).toBe(false);
    expect(isPrivateSpot({ ...roof, sunrise: NaN })).toBe(false);
    expect(() => parsePrivateSpots('{')).toThrow();
  });
  it('uses neighborhood coordinates for private weather and precise coordinates for public spots', () => {
    expect(forecastCoordinates(roof)).toEqual({ lat: 37.78, lng: -122.45 });
    expect(forecastCoordinates({ ...roof, visibility: undefined })).toEqual({ lat: roof.lat, lng: roof.lng });
  });
});

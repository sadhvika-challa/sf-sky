import { describe, expect, it, vi } from 'vitest';
import { SavedSpotsController } from '../../hooks/useSavedSpots';
import { SAVED_SPOTS_STORAGE_KEY, serializeSavedSpots } from '../../utils/savedSpots';
import { createPreferencesKeyValueStore } from '../preferencesStorage';
import { selectSavedSpotsKeyValueStore } from '../savedSpotsStorage';
import type { KeyValueStore } from '../storage';

const KNOWN = new Set(['sf-ocean-beach', 'austin-mount-bonnell']);

function createFakePreferences(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: values.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      values.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      values.delete(key);
    }),
  };
}

describe('native Preferences saved-spots authority', () => {
  it('selects IndexedDB on web and Preferences on native', () => {
    const web = { updateConsistency: 'cross-context' } as KeyValueStore;
    const native = { updateConsistency: 'in-process' } as KeyValueStore;
    expect(selectSavedSpotsKeyValueStore(false, web, native)).toBe(web);
    expect(selectSavedSpotsKeyValueStore(true, web, native)).toBe(native);
  });

  it('migrates one existing WebView value into native Preferences', async () => {
    const preferences = createFakePreferences();
    const legacyValue = serializeSavedSpots(['sf-ocean-beach']);
    const legacyStore = { get: vi.fn(async () => legacyValue) };
    const store = createPreferencesKeyValueStore({ preferences, legacyStore });

    await expect(store.get(SAVED_SPOTS_STORAGE_KEY)).resolves.toBe(legacyValue);
    expect(preferences.values.get(SAVED_SPOTS_STORAGE_KEY)).toBe(JSON.stringify({
      format: 'soleil.preferences.v1',
      value: legacyValue,
    }));
    expect(legacyStore.get).toHaveBeenCalledTimes(1);

    await store.remove(SAVED_SPOTS_STORAGE_KEY);
    await expect(store.get(SAVED_SPOTS_STORAGE_KEY)).resolves.toBeNull();
    expect(legacyStore.get).toHaveBeenCalledTimes(1);
  });

  it('serializes durable native saves and persists stable IDs without coordinates', async () => {
    const preferences = createFakePreferences();
    const store = createPreferencesKeyValueStore({ preferences });
    const controller = new SavedSpotsController(store, KNOWN);
    await controller.initialize();

    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(true);
    expect(await controller.setSaved('austin-mount-bonnell', true)).toBe(true);
    const durableEnvelope = preferences.values.get(SAVED_SPOTS_STORAGE_KEY);
    expect(JSON.parse(durableEnvelope ?? '').value).toBe(
      serializeSavedSpots(['sf-ocean-beach', 'austin-mount-bonnell']),
    );
    expect(durableEnvelope).not.toMatch(/latitude|longitude|\blat\b|\blng\b/);
  });

  it('rolls a failed save back to the prior durable value', async () => {
    const preferences = createFakePreferences();
    const controller = new SavedSpotsController(
      createPreferencesKeyValueStore({ preferences }),
      KNOWN,
    );
    await controller.initialize();
    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(true);
    const priorDurable = preferences.values.get(SAVED_SPOTS_STORAGE_KEY);
    preferences.set.mockRejectedValueOnce(new Error('UserDefaults failed'));

    expect(await controller.setSaved('austin-mount-bonnell', true)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      savedSpotIds: ['sf-ocean-beach'],
      error: 'write-failed',
    });
    expect(preferences.values.get(SAVED_SPOTS_STORAGE_KEY)).toBe(priorDurable);
  });

  it('rolls a failed removal back without a partial marker state', async () => {
    const preferences = createFakePreferences();
    const controller = new SavedSpotsController(
      createPreferencesKeyValueStore({ preferences }),
      KNOWN,
    );
    await controller.initialize();
    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(true);
    const priorDurable = preferences.values.get(SAVED_SPOTS_STORAGE_KEY);
    preferences.set.mockRejectedValueOnce(new Error('UserDefaults failed'));

    expect(await controller.setSaved('sf-ocean-beach', false)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      savedSpotIds: ['sf-ocean-beach'],
      error: 'write-failed',
    });
    expect(preferences.values.get(SAVED_SPOTS_STORAGE_KEY)).toBe(priorDurable);
    expect(preferences.remove).not.toHaveBeenCalled();
  });

  it('uses one durable null envelope so legacy data cannot be resurrected', async () => {
    const preferences = createFakePreferences();
    const legacyStore = {
      get: vi.fn(async () => serializeSavedSpots(['sf-ocean-beach'])),
    };
    const first = createPreferencesKeyValueStore({ preferences, legacyStore });
    await expect(first.get(SAVED_SPOTS_STORAGE_KEY)).resolves.toContain('sf-ocean-beach');
    await first.remove(SAVED_SPOTS_STORAGE_KEY);

    const relaunched = createPreferencesKeyValueStore({ preferences, legacyStore });
    await expect(relaunched.get(SAVED_SPOTS_STORAGE_KEY)).resolves.toBeNull();
    expect(legacyStore.get).toHaveBeenCalledTimes(1);
    expect(preferences.remove).not.toHaveBeenCalled();
  });

  it('protects a future-version native value without overwriting it', async () => {
    const original = JSON.stringify({ version: 9, spotIds: ['future-spot'] });
    const preferences = createFakePreferences({
      [SAVED_SPOTS_STORAGE_KEY]: JSON.stringify({
        format: 'soleil.preferences.v1',
        value: original,
      }),
    });
    const controller = new SavedSpotsController(
      createPreferencesKeyValueStore({ preferences }),
      KNOWN,
    );
    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'protected',
      error: 'future-version',
    });
    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(false);
    expect(JSON.parse(preferences.values.get(SAVED_SPOTS_STORAGE_KEY) ?? '').value).toBe(original);
    expect(preferences.set).not.toHaveBeenCalled();
  });
});

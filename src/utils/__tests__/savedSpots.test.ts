import { describe, expect, it, vi } from 'vitest';
import { SavedSpotsController } from '../../hooks/useSavedSpots';
import { createBrowserKeyValueStore, StorageAccessError, type KeyValueStore } from '../../platform/storage';
import {
  SAVED_SPOTS_STORAGE_KEY,
  parseSavedSpots,
  persistSavedSpots,
  serializeSavedSpots,
} from '../savedSpots';

const KNOWN = new Set(['sf-ocean-beach', 'sf-twin-peaks', 'austin-mount-bonnell']);
const ALIASES = { 'sf-twin-peaks-overlook': 'sf-twin-peaks' };

class MemoryStore implements KeyValueStore {
  value: string | null = null;
  writes: string[] = [];
  failRead = false;
  failWrite = false;

  async get() {
    if (this.failRead) throw new Error('read failed');
    return this.value;
  }

  async set(_key: string, value: string) {
    this.writes.push(value);
    if (this.failWrite) throw new Error('write failed');
    this.value = value;
  }

  async remove() {
    this.value = null;
  }
}

describe('saved-spots payload', () => {
  it('round-trips the versioned stable-ID payload', () => {
    const raw = serializeSavedSpots(['sf-ocean-beach', 'austin-mount-bonnell']);
    expect(parseSavedSpots(raw, KNOWN, ALIASES)).toEqual({
      kind: 'loaded',
      spotIds: ['sf-ocean-beach', 'austin-mount-bonnell'],
      needsRewrite: false,
    });
  });

  it('migrates legacy shapes, aliases retired IDs, deduplicates, and prunes unknown IDs', () => {
    const parsed = parseSavedSpots(JSON.stringify({
      version: 0,
      savedSpotIds: [
        'sf-twin-peaks-overlook',
        'sf-twin-peaks',
        'retired-unknown',
        7,
        'sf-ocean-beach',
      ],
    }), KNOWN, ALIASES);

    expect(parsed).toEqual({
      kind: 'loaded',
      spotIds: ['sf-twin-peaks', 'sf-ocean-beach'],
      needsRewrite: true,
    });
  });

  it('handles corrupt data as empty without throwing', () => {
    expect(parseSavedSpots('{broken', KNOWN, ALIASES)).toEqual({
      kind: 'corrupt',
      spotIds: [],
      needsRewrite: false,
    });
    expect(parseSavedSpots(JSON.stringify({ version: 1, spotIds: 'nope' }), KNOWN)).toEqual({
      kind: 'corrupt',
      spotIds: [],
      needsRewrite: false,
    });
  });

  it('detects unknown future versions and refuses to overwrite them', async () => {
    const store = new MemoryStore();
    store.value = JSON.stringify({ version: 42, spotIds: ['future-id'], metadata: 'keep me' });
    const original = store.value;

    expect(parseSavedSpots(store.value, KNOWN)).toEqual({
      kind: 'future-version',
      version: 42,
      spotIds: [],
      needsRewrite: false,
    });
    await expect(persistSavedSpots(store, ['sf-ocean-beach'], KNOWN)).rejects.toThrow(
      'unsupported version 42',
    );
    expect(store.value).toBe(original);
    expect(store.writes).toEqual([]);
  });
});

describe('SavedSpotsController', () => {
  it('rewrites a cleaned migration and rehydrates it on a later launch', async () => {
    const store = new MemoryStore();
    store.value = JSON.stringify(['sf-twin-peaks-overlook', 'unknown']);
    const first = new SavedSpotsController(store, KNOWN, ALIASES);
    await first.initialize();

    expect(first.getSnapshot()).toMatchObject({
      status: 'ready',
      savedSpotIds: ['sf-twin-peaks'],
      error: null,
    });
    expect(store.value).toBe(serializeSavedSpots(['sf-twin-peaks']));

    const nextLaunch = new SavedSpotsController(store, KNOWN, ALIASES);
    await nextLaunch.initialize();
    expect(nextLaunch.getSnapshot().savedSpotIds).toEqual(['sf-twin-peaks']);
  });

  it('preserves save/unsave ordering and makes repeated intent idempotent', async () => {
    const store = new MemoryStore();
    const controller = new SavedSpotsController(store, KNOWN, ALIASES);
    await controller.initialize();

    const save = controller.setSaved('sf-ocean-beach', true);
    const duplicateSave = controller.setSaved('sf-ocean-beach', true);
    const unsave = controller.setSaved('sf-ocean-beach', false);
    expect(await save).toBe(true);
    expect(await duplicateSave).toBe(true);
    expect(await unsave).toBe(true);

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      savedSpotIds: [],
      error: null,
    });
    expect(store.writes).toEqual([
      serializeSavedSpots(['sf-ocean-beach']),
      serializeSavedSpots([]),
    ]);
  });

  it('rolls back optimistic state and exposes a durable-write error', async () => {
    const store = new MemoryStore();
    const controller = new SavedSpotsController(store, KNOWN, ALIASES);
    await controller.initialize();
    const observed: string[][] = [];
    controller.subscribe(() => observed.push([...controller.getSnapshot().savedSpotIds]));
    store.failWrite = true;

    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(false);
    expect(observed).toContainEqual(['sf-ocean-beach']);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      savedSpotIds: [],
      error: 'write-failed',
    });
  });

  it('protects a future payload from hook-level mutations', async () => {
    const store = new MemoryStore();
    store.value = JSON.stringify({ version: 2, spotIds: ['new-format-id'] });
    const original = store.value;
    const controller = new SavedSpotsController(store, KNOWN, ALIASES);
    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'protected',
      error: 'future-version',
    });
    expect(await controller.setSaved('sf-ocean-beach', true)).toBe(false);
    expect(store.value).toBe(original);
    expect(store.writes).toEqual([]);
  });

  it('rehydrates external storage changes', async () => {
    const store = new MemoryStore();
    const controller = new SavedSpotsController(store, KNOWN, ALIASES);
    await controller.initialize();
    store.value = serializeSavedSpots(['austin-mount-bonnell']);

    await controller.rehydrate();
    expect(controller.getSnapshot().savedSpotIds).toEqual(['austin-mount-bonnell']);
  });
});

describe('guarded browser storage', () => {
  it('converts browser storage exceptions into typed async failures', async () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('privacy mode'); }),
    } as unknown as Storage;
    const store = createBrowserKeyValueStore(() => storage, () => undefined);

    await expect(store.get(SAVED_SPOTS_STORAGE_KEY)).rejects.toBeInstanceOf(StorageAccessError);
  });
});

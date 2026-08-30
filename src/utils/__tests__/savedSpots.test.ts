import { describe, expect, it, vi } from 'vitest';
import { SavedSpotsController } from '../../hooks/useSavedSpots';
import { createBrowserKeyValueStore, StorageAccessError, type KeyValueStore, type KeyValueUpdate } from '../../platform/storage';
import {
  SAVED_SPOTS_STORAGE_KEY,
  parseSavedSpots,
  serializeSavedSpots,
  updateSavedSpot,
} from '../savedSpots';

const KNOWN = new Set(['sf-ocean-beach', 'sf-twin-peaks', 'austin-mount-bonnell']);
const ALIASES = { 'sf-twin-peaks-overlook': 'sf-twin-peaks' };
const RETIRED = new Set(['retired-unknown']);

class MemoryStore implements KeyValueStore {
  readonly updateConsistency = 'in-process' as const;
  value: string | null = null;
  writes: string[] = [];
  failRead = false;
  failWrite = false;
  private updateTail: Promise<void> = Promise.resolve();
  private readsToHold = 0;
  private releaseHeldReads: Promise<void> = Promise.resolve();
  private releaseHeldReadsNow: () => void = () => undefined;
  private allReadsHeld: Promise<void> = Promise.resolve();
  private markAllReadsHeld: () => void = () => undefined;

  holdNextReads(count: number) {
    this.readsToHold = count;
    this.releaseHeldReads = new Promise((resolve) => { this.releaseHeldReadsNow = resolve; });
    this.allReadsHeld = new Promise((resolve) => { this.markAllReadsHeld = resolve; });
    return {
      allHeld: this.allReadsHeld,
      release: () => this.releaseHeldReadsNow(),
    };
  }

  async get() {
    if (this.failRead) throw new Error('read failed');
    if (this.readsToHold > 0) {
      this.readsToHold -= 1;
      if (this.readsToHold === 0) this.markAllReadsHeld();
      await this.releaseHeldReads;
    }
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

  async update<Result>(
    _key: string,
    updater: (current: string | null) => Promise<KeyValueUpdate<Result>> | KeyValueUpdate<Result>,
  ): Promise<Result> {
    const operation = this.updateTail.then(async () => {
      if (this.failRead) throw new Error('read failed');
      const update = await updater(this.value);
      if (update.value !== undefined) {
        if (update.value === null) await this.remove();
        else await this.set(SAVED_SPOTS_STORAGE_KEY, update.value);
      }
      return update.result;
    });
    this.updateTail = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

describe('saved-spots payload', () => {
  it('round-trips the versioned stable-ID payload', () => {
    const raw = serializeSavedSpots(['sf-ocean-beach', 'austin-mount-bonnell']);
    expect(parseSavedSpots(raw, KNOWN, ALIASES)).toEqual({
      kind: 'loaded',
      spotIds: ['sf-ocean-beach', 'austin-mount-bonnell'],
      opaqueSpotIds: [],
      needsRewrite: false,
    });
  });

  it('migrates legacy shapes, aliases IDs, deduplicates, and prunes only explicitly retired IDs', () => {
    const parsed = parseSavedSpots(JSON.stringify({
      version: 0,
      savedSpotIds: [
        'sf-twin-peaks-overlook',
        'sf-twin-peaks',
        'retired-unknown',
        7,
        'sf-ocean-beach',
        'future-catalog-spot',
      ],
    }), KNOWN, ALIASES, RETIRED);

    expect(parsed).toEqual({
      kind: 'loaded',
      spotIds: ['sf-twin-peaks', 'sf-ocean-beach'],
      opaqueSpotIds: ['future-catalog-spot'],
      needsRewrite: true,
    });
  });

  it('handles corrupt data as empty without throwing', () => {
    expect(parseSavedSpots('{broken', KNOWN, ALIASES)).toEqual({
      kind: 'corrupt',
      spotIds: [],
      opaqueSpotIds: [],
      needsRewrite: false,
    });
    expect(parseSavedSpots(JSON.stringify({ version: 1, spotIds: 'nope' }), KNOWN)).toEqual({
      kind: 'corrupt',
      spotIds: [],
      opaqueSpotIds: [],
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
      opaqueSpotIds: [],
      needsRewrite: false,
    });
    await expect(updateSavedSpot(store, 'sf-ocean-beach', true, KNOWN)).rejects.toThrow(
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
    expect(store.value).toBe(serializeSavedSpots(['sf-twin-peaks', 'unknown']));

    const nextLaunch = new SavedSpotsController(store, KNOWN, ALIASES);
    await nextLaunch.initialize();
    expect(nextLaunch.getSnapshot().savedSpotIds).toEqual(['sf-twin-peaks']);
  });

  it('keeps opaque same-schema IDs across known save and unsave writes', async () => {
    const store = new MemoryStore();
    store.value = serializeSavedSpots(['future-catalog-spot', 'sf-twin-peaks']);
    const controller = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    await controller.initialize();

    expect(controller.getSnapshot().savedSpotIds).toEqual(['sf-twin-peaks']);
    await controller.setSaved('sf-ocean-beach', true);
    expect(JSON.parse(store.value ?? '')).toEqual({
      version: 1,
      spotIds: ['sf-twin-peaks', 'sf-ocean-beach', 'future-catalog-spot'],
    });
    await controller.setSaved('sf-twin-peaks', false);
    expect(JSON.parse(store.value ?? '')).toEqual({
      version: 1,
      spotIds: ['sf-ocean-beach', 'future-catalog-spot'],
    });
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

  it('rehydrates and preserves newly observed opaque IDs on the next write', async () => {
    const store = new MemoryStore();
    const controller = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    await controller.initialize();
    store.value = serializeSavedSpots(['austin-mount-bonnell', 'other-release-spot']);
    await controller.rehydrate();

    expect(controller.getSnapshot().savedSpotIds).toEqual(['austin-mount-bonnell']);
    await controller.setSaved('sf-ocean-beach', true);
    expect(JSON.parse(store.value ?? '').spotIds).toEqual([
      'austin-mount-bonnell',
      'sf-ocean-beach',
      'other-release-spot',
    ]);
  });

  it('preserves concurrent different-ID saves after both controllers read the same old snapshot', async () => {
    const store = new MemoryStore();
    store.value = serializeSavedSpots(['other-release-spot']);
    const reads = store.holdNextReads(2);
    const first = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    const second = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    const firstLoad = first.initialize();
    const secondLoad = second.initialize();
    await reads.allHeld;
    reads.release();
    await Promise.all([firstLoad, secondLoad]);

    const [firstSaved, secondSaved] = await Promise.all([
      first.setSaved('sf-ocean-beach', true),
      second.setSaved('austin-mount-bonnell', true),
    ]);
    expect(firstSaved).toBe(true);
    expect(secondSaved).toBe(true);
    expect(parseSavedSpots(store.value, KNOWN, ALIASES, RETIRED)).toMatchObject({
      kind: 'loaded',
      spotIds: ['sf-ocean-beach', 'austin-mount-bonnell'],
      opaqueSpotIds: ['other-release-spot'],
    });

    await Promise.all([first.rehydrate(), second.rehydrate()]);
    expect(first.getSnapshot().savedSpotIds).toEqual([
      'sf-ocean-beach',
      'austin-mount-bonnell',
    ]);
    expect(second.getSnapshot().savedSpotIds).toEqual(first.getSnapshot().savedSpotIds);
  });

  it('uses durable commit order as the deterministic same-ID conflict rule', async () => {
    const store = new MemoryStore();
    store.value = serializeSavedSpots(['sf-twin-peaks']);
    const first = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    const second = new SavedSpotsController(store, KNOWN, ALIASES, RETIRED);
    await Promise.all([first.initialize(), second.initialize()]);

    const unsaveThenSave = await Promise.all([
      first.setSaved('sf-twin-peaks', false),
      second.setSaved('sf-twin-peaks', true),
    ]);
    expect(unsaveThenSave).toEqual([true, true]);
    expect(parseSavedSpots(store.value, KNOWN).spotIds).toEqual(['sf-twin-peaks']);

    await Promise.all([first.rehydrate(), second.rehydrate()]);
    const saveThenUnsave = await Promise.all([
      first.setSaved('sf-twin-peaks', true),
      second.setSaved('sf-twin-peaks', false),
    ]);
    expect(saveThenUnsave).toEqual([true, true]);
    expect(parseSavedSpots(store.value, KNOWN).spotIds).toEqual([]);
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

  it('rehydrates only for matching storage changes and meaningful resume events, then cleans up', () => {
    type Handler = EventListenerOrEventListenerObject;
    const windowListeners = new Map<string, Set<Handler>>();
    const documentListeners = new Map<string, Set<Handler>>();
    let visibilityState: DocumentVisibilityState = 'visible';

    const add = (listeners: Map<string, Set<Handler>>, type: string, handler: Handler) => {
      const handlers = listeners.get(type) ?? new Set<Handler>();
      handlers.add(handler);
      listeners.set(type, handlers);
    };
    const remove = (listeners: Map<string, Set<Handler>>, type: string, handler: Handler) => {
      listeners.get(type)?.delete(handler);
    };
    const dispatch = (listeners: Map<string, Set<Handler>>, type: string, event: Event) => {
      for (const handler of listeners.get(type) ?? []) {
        if (typeof handler === 'function') handler(event);
        else handler.handleEvent(event);
      }
    };
    const fakeDocument = {
      get visibilityState() { return visibilityState; },
      addEventListener: (type: string, handler: Handler) => add(documentListeners, type, handler),
      removeEventListener: (type: string, handler: Handler) => remove(documentListeners, type, handler),
    } as unknown as Document;
    const fakeWindow = {
      document: fakeDocument,
      addEventListener: (type: string, handler: Handler) => add(windowListeners, type, handler),
      removeEventListener: (type: string, handler: Handler) => remove(windowListeners, type, handler),
    } as unknown as Window;
    const store = createBrowserKeyValueStore(() => undefined, () => fakeWindow);
    const listener = vi.fn();
    const unsubscribe = store.subscribe?.(SAVED_SPOTS_STORAGE_KEY, listener);

    dispatch(windowListeners, 'storage', { key: 'another:key' } as StorageEvent);
    expect(listener).not.toHaveBeenCalled();
    dispatch(windowListeners, 'storage', { key: SAVED_SPOTS_STORAGE_KEY } as StorageEvent);
    expect(listener).toHaveBeenCalledTimes(1);
    dispatch(windowListeners, 'pageshow', {} as PageTransitionEvent);
    expect(listener).toHaveBeenCalledTimes(2);

    visibilityState = 'hidden';
    dispatch(documentListeners, 'visibilitychange', {} as Event);
    expect(listener).toHaveBeenCalledTimes(2);
    visibilityState = 'visible';
    dispatch(documentListeners, 'visibilitychange', {} as Event);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe?.();
    dispatch(windowListeners, 'storage', { key: SAVED_SPOTS_STORAGE_KEY } as StorageEvent);
    dispatch(windowListeners, 'pageshow', {} as PageTransitionEvent);
    dispatch(documentListeners, 'visibilitychange', {} as Event);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('uses the injected Web Lock for cross-context read-modify-write serialization', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } as unknown as Storage;
    let lockTail: Promise<void> = Promise.resolve();
    const requestedNames: string[] = [];
    const locks = {
      request<Result>(
        name: string,
        _options: LockOptions,
        callback: () => Promise<Result>,
      ): Promise<Result> {
        requestedNames.push(name);
        const operation = lockTail.then(callback);
        lockTail = operation.then(() => undefined, () => undefined);
        return operation;
      },
    } as unknown as LockManager;
    const firstStore = createBrowserKeyValueStore(
      () => storage,
      () => undefined,
      () => locks,
    );
    const secondStore = createBrowserKeyValueStore(
      () => storage,
      () => undefined,
      () => locks,
    );
    let releaseFirst: () => void = () => undefined;
    let markFirstRead: () => void = () => undefined;
    const firstRead = new Promise<void>((resolve) => { markFirstRead = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = firstStore.update('shared-key', async (current) => {
      expect(current).toBeNull();
      markFirstRead();
      await firstGate;
      return { value: 'first', result: 'first committed' };
    });
    await firstRead;
    const second = secondStore.update('shared-key', (current) => {
      expect(current).toBe('first');
      return { value: 'second', result: 'second committed' };
    });
    releaseFirst();

    await expect(first).resolves.toBe('first committed');
    await expect(second).resolves.toBe('second committed');
    expect(values.get('shared-key')).toBe('second');
    expect(requestedNames).toEqual([
      'soleil:key-value:shared-key',
      'soleil:key-value:shared-key',
    ]);
    expect(firstStore.updateConsistency).toBe('cross-context');
  });

  it('labels the no-Web-Locks fallback as in-process consistency', () => {
    const store = createBrowserKeyValueStore(
      () => undefined,
      () => undefined,
      () => undefined,
    );
    expect(store.updateConsistency).toBe('in-process');
  });
});

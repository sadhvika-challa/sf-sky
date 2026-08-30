import {
  StorageAccessError,
  type KeyValueStore,
  type KeyValueUpdate,
} from './storage';

interface IndexedDbKeyValueStoreOptions {
  databaseName: string;
  objectStoreName: string;
  getIndexedDb?: () => IDBFactory | undefined;
  getLegacyStorage?: () => Storage | undefined;
  getWindow?: () => Window | undefined;
  createBroadcastChannel?: (name: string) => BroadcastChannel | undefined;
}

function defaultIndexedDb(): IDBFactory | undefined {
  return typeof indexedDB === 'undefined' ? undefined : indexedDB;
}

function defaultLegacyStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * IndexedDB readwrite transactions are the durable cross-context boundary for
 * saved spots. The first transaction imports the legacy localStorage value,
 * including a null tombstone, so an older cached client cannot later replace
 * the new authority merely by writing the old key.
 */
export function createIndexedDbKeyValueStore({
  databaseName,
  objectStoreName,
  getIndexedDb = defaultIndexedDb,
  getLegacyStorage = defaultLegacyStorage,
  getWindow = () => typeof window === 'undefined' ? undefined : window,
  createBroadcastChannel = (name) =>
    typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(name),
}: IndexedDbKeyValueStoreOptions): KeyValueStore {
  let databasePromise: Promise<IDBDatabase> | null = null;
  let notificationChannel: BroadcastChannel | undefined;
  const localListeners = new Map<string, Set<() => void>>();
  const channelName = `${databaseName}:${objectStoreName}:updates`;

  const openDatabase = (): Promise<IDBDatabase> => {
    if (databasePromise) return databasePromise;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const factory = getIndexedDb();
      if (!factory) {
        reject(new StorageAccessError('get', {
          cause: new Error('IndexedDB is unavailable.'),
        }));
        return;
      }
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(objectStoreName)) {
          database.createObjectStore(objectStoreName);
        }
      };
      request.onerror = () => reject(new StorageAccessError('get', {
        cause: request.error ?? new Error('IndexedDB open failed.'),
      }));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    }).catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
    databasePromise = opening;
    return opening;
  };

  const readLegacy = (key: string): string | null => {
    try {
      return getLegacyStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const mirrorLegacy = (key: string, value: string | null) => {
    try {
      const storage = getLegacyStorage();
      if (!storage) return;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      // IndexedDB is authoritative. A compatibility mirror failure must not
      // turn an already committed durable operation into a false failure.
    }
  };

  const notify = (key: string) => {
    for (const listener of localListeners.get(key) ?? []) listener();
    notificationChannel ??= createBroadcastChannel(channelName);
    notificationChannel?.postMessage(key);
  };

  const atomicUpdate = async <Result>(
    key: string,
    updater: (current: string | null) => KeyValueUpdate<Result>,
  ): Promise<Result> => {
    const database = await openDatabase();
    let wrote = false;
    let writtenValue: string | null = null;
    const result = await new Promise<Result>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, 'readwrite');
      const objectStore = transaction.objectStore(objectStoreName);
      const request = objectStore.get(key);
      let operationResult: Result;
      let operationError: unknown;

      request.onerror = () => {
        operationError = request.error ?? new Error('IndexedDB read failed.');
        transaction.abort();
      };
      request.onsuccess = () => {
        try {
          const stored = request.result as string | null | undefined;
          const current = stored === undefined ? readLegacy(key) : stored;
          if (stored === undefined) objectStore.put(current, key);
          const update = updater(current);
          operationResult = update.result;
          if (update.value !== undefined) {
            wrote = true;
            writtenValue = update.value;
            objectStore.put(update.value, key);
          }
        } catch (error) {
          operationError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(operationResult);
      transaction.onerror = () => reject(operationError ?? new StorageAccessError('set', {
        cause: transaction.error ?? new Error('IndexedDB transaction failed.'),
      }));
      transaction.onabort = () => reject(operationError ?? new StorageAccessError('set', {
        cause: transaction.error ?? new Error('IndexedDB transaction aborted.'),
      }));
    });

    if (wrote) {
      mirrorLegacy(key, writtenValue);
      notify(key);
    }
    return result;
  };

  return {
    get updateConsistency() {
      return getIndexedDb() ? 'cross-context' : 'unavailable';
    },
    get(key) {
      return atomicUpdate(key, (current) => ({ result: current }));
    },
    async set(key, value) {
      await atomicUpdate(key, () => ({ value, result: undefined }));
    },
    async remove(key) {
      await atomicUpdate(key, () => ({ value: null, result: undefined }));
    },
    update: atomicUpdate,
    subscribe(key, listener) {
      const listeners = localListeners.get(key) ?? new Set<() => void>();
      listeners.add(listener);
      localListeners.set(key, listeners);

      const target = getWindow();
      const channel = createBroadcastChannel(channelName);
      const onMessage = (event: MessageEvent) => {
        if (event.data === key) listener();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      const onResume = () => listener();
      const onVisibility = () => {
        if (target?.document.visibilityState === 'visible') listener();
      };
      channel?.addEventListener('message', onMessage);
      target?.addEventListener('storage', onStorage);
      target?.addEventListener('pageshow', onResume);
      target?.document.addEventListener('visibilitychange', onVisibility);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) localListeners.delete(key);
        channel?.removeEventListener('message', onMessage);
        channel?.close();
        target?.removeEventListener('storage', onStorage);
        target?.removeEventListener('pageshow', onResume);
        target?.document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

export const savedSpotsKeyValueStore = createIndexedDbKeyValueStore({
  databaseName: 'soleil-device-storage',
  objectStoreName: 'key-values',
});

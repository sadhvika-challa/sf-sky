export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  subscribe?(key: string, listener: () => void): () => void;
}

export class StorageAccessError extends Error {
  readonly operation: 'get' | 'set' | 'remove';

  constructor(
    operation: 'get' | 'set' | 'remove',
    options?: ErrorOptions,
  ) {
    super(`Device storage ${operation} failed.`, options);
    this.name = 'StorageAccessError';
    this.operation = operation;
  }
}

type StorageGetter = () => Storage | undefined;

function defaultStorageGetter(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Async by contract so a Capacitor Preferences adapter can replace this web
 * implementation without changing consumers. Every browser access is guarded
 * because privacy modes can throw even while localStorage exists.
 */
export function createBrowserKeyValueStore(
  getStorage: StorageGetter = defaultStorageGetter,
  getWindow: () => Window | undefined = () =>
    typeof window === 'undefined' ? undefined : window,
): KeyValueStore {
  return {
    async get(key) {
      try {
        return getStorage()?.getItem(key) ?? null;
      } catch (cause) {
        throw new StorageAccessError('get', { cause });
      }
    },
    async set(key, value) {
      try {
        const storage = getStorage();
        if (!storage) throw new Error('Storage is unavailable.');
        storage.setItem(key, value);
      } catch (cause) {
        throw new StorageAccessError('set', { cause });
      }
    },
    async remove(key) {
      try {
        const storage = getStorage();
        if (!storage) throw new Error('Storage is unavailable.');
        storage.removeItem(key);
      } catch (cause) {
        throw new StorageAccessError('remove', { cause });
      }
    },
    subscribe(key, listener) {
      const target = getWindow();
      if (!target) return () => undefined;

      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      const onResume = () => listener();
      const onVisibility = () => {
        if (target.document.visibilityState === 'visible') listener();
      };
      target.addEventListener('storage', onStorage);
      target.addEventListener('pageshow', onResume);
      target.document.addEventListener('visibilitychange', onVisibility);
      return () => {
        target.removeEventListener('storage', onStorage);
        target.removeEventListener('pageshow', onResume);
        target.document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

export const browserKeyValueStore = createBrowserKeyValueStore();

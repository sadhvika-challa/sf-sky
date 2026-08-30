export interface KeyValueStore {
  readonly updateConsistency: 'cross-context' | 'in-process';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  update<Result>(
    key: string,
    updater: (current: string | null) => Promise<KeyValueUpdate<Result>> | KeyValueUpdate<Result>,
  ): Promise<Result>;
  subscribe?(key: string, listener: () => void): () => void;
}

export interface KeyValueUpdate<Result> {
  /** Undefined leaves the durable value unchanged. Null removes it. */
  value?: string | null;
  result: Result;
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
type LockManagerGetter = () => LockManager | undefined;

const inProcessTransactions = new Map<string, Promise<void>>();

async function runInProcessExclusive<Result>(
  name: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = inProcessTransactions.get(name) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  inProcessTransactions.set(name, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (inProcessTransactions.get(name) === tail) inProcessTransactions.delete(name);
  }
}

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
  getLockManager: LockManagerGetter = () =>
    typeof navigator === 'undefined' ? undefined : navigator.locks,
): KeyValueStore {
  const runUpdate = async <Result>(
    key: string,
    updater: (current: string | null) => Promise<KeyValueUpdate<Result>> | KeyValueUpdate<Result>,
  ): Promise<Result> => {
    const operation = async () => {
      let storage: Storage;
      try {
        const availableStorage = getStorage();
        if (!availableStorage) throw new Error('Storage is unavailable.');
        storage = availableStorage;
      } catch (cause) {
        throw new StorageAccessError('get', { cause });
      }

      let current: string | null;
      try {
        current = storage.getItem(key);
      } catch (cause) {
        throw new StorageAccessError('get', { cause });
      }
      const update = await updater(current);
      try {
        if (update.value === null) storage.removeItem(key);
        else if (update.value !== undefined) storage.setItem(key, update.value);
      } catch (cause) {
        throw new StorageAccessError(update.value === null ? 'remove' : 'set', { cause });
      }
      return update.result;
    };

    const lockName = `soleil:key-value:${key}`;
    const lockManager = getLockManager();
    if (lockManager) {
      return lockManager.request(lockName, { mode: 'exclusive' }, operation);
    }

    // This keeps React roots and adapters in one JS realm safe. It cannot
    // provide cross-tab atomicity in browsers without Web Locks, so callers
    // can inspect updateConsistency and must not claim that stronger contract.
    return runInProcessExclusive(lockName, operation);
  };

  return {
    get updateConsistency() {
      return getLockManager() ? 'cross-context' : 'in-process';
    },
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
    update: runUpdate,
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

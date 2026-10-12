import { describe, expect, it, vi } from 'vitest';
import { createIndexedDbKeyValueStore } from '../indexedDbStorage';

interface FakeDatabase extends IDBDatabase {
  closed: boolean;
}

function createTransaction(): IDBTransaction {
  const transaction = {
    error: null,
    onabort: null,
    oncomplete: null,
    onerror: null,
    abort: vi.fn(),
  } as unknown as IDBTransaction;
  const objectStore = {
    get: vi.fn(() => {
      const request = {
        error: null,
        result: null,
        onerror: null,
        onsuccess: null,
      } as unknown as IDBRequest;
      queueMicrotask(() => {
        request.onsuccess?.({} as Event);
        queueMicrotask(() => transaction.oncomplete?.({} as Event));
      });
      return request;
    }),
    put: vi.fn(),
  } as unknown as IDBObjectStore;
  transaction.objectStore = vi.fn(() => objectStore);
  return transaction;
}

function createDatabase(): FakeDatabase {
  const database = {
    closed: false,
    objectStoreNames: { contains: () => true },
    onclose: null,
    onversionchange: null,
    close: vi.fn(() => { database.closed = true; }),
    transaction: vi.fn(() => {
      if (database.closed) throw new DOMException('Database is closed.', 'InvalidStateError');
      return createTransaction();
    }),
  } as unknown as FakeDatabase;
  return database;
}

describe('IndexedDB connection lifecycle', () => {
  it('invalidates a version-changed cached connection and reopens before the next transaction', async () => {
    const databases: FakeDatabase[] = [];
    const open = vi.fn(() => {
      const database = createDatabase();
      databases.push(database);
      const request = {
        error: null,
        result: database,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event));
      return request;
    });
    const store = createIndexedDbKeyValueStore({
      databaseName: 'test-database',
      objectStoreName: 'values',
      getIndexedDb: () => ({ open } as unknown as IDBFactory),
      getLegacyStorage: () => undefined,
      getWindow: () => undefined,
      createBroadcastChannel: () => undefined,
    });

    await expect(store.get('saved')).resolves.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    expect(databases[0].transaction).toHaveBeenCalledTimes(1);

    databases[0].onversionchange?.({} as IDBVersionChangeEvent);
    expect(databases[0].close).toHaveBeenCalledTimes(1);
    expect(databases[0].closed).toBe(true);

    await expect(store.get('saved')).resolves.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    expect(databases[1]).not.toBe(databases[0]);
    expect(databases[1].transaction).toHaveBeenCalledTimes(1);
  });

  it('does not let a late close from an old connection invalidate its replacement', async () => {
    const databases: FakeDatabase[] = [];
    const open = vi.fn(() => {
      const database = createDatabase();
      databases.push(database);
      const request = {
        error: null,
        result: database,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event));
      return request;
    });
    const store = createIndexedDbKeyValueStore({
      databaseName: 'test-database',
      objectStoreName: 'values',
      getIndexedDb: () => ({ open } as unknown as IDBFactory),
      getLegacyStorage: () => undefined,
      getWindow: () => undefined,
      createBroadcastChannel: () => undefined,
    });

    await store.get('saved');
    const oldClose = databases[0].onclose;
    databases[0].onversionchange?.({} as IDBVersionChangeEvent);
    await store.get('saved');
    oldClose?.call(databases[0], {} as Event);
    await store.get('saved');

    expect(open).toHaveBeenCalledTimes(2);
    expect(databases[1].transaction).toHaveBeenCalledTimes(2);
  });
});

it('mirrors the latest authority when cross-tab completion callbacks arrive out of order', async () => {
  let authority: string | null = null;
  let mirror: string | null = null;
  let transactionCount = 0;
  const completions: Array<() => void> = [];
  const database = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const ordinal = ++transactionCount;
      const transaction = { oncomplete: null } as unknown as IDBTransaction;
      transaction.objectStore = () => ({
        get: () => {
          const request = { onsuccess: null } as unknown as IDBRequest;
          queueMicrotask(() => {
            Object.defineProperty(request, 'result', { value: authority });
            request.onsuccess?.({} as Event);
            const complete = () => transaction.oncomplete?.({} as Event);
            if (ordinal <= 2) completions.push(complete);
            else queueMicrotask(complete);
          });
          return request;
        },
        put: (value: string | null) => { authority = value; },
      } as unknown as IDBObjectStore);
      return transaction;
    },
  } as unknown as IDBDatabase;
  const factory = {
    open: () => {
      const request = { result: database, onsuccess: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.({} as Event));
      return request;
    },
  } as unknown as IDBFactory;
  const storage = {
    getItem: () => mirror,
    setItem: (_key: string, value: string) => { mirror = value; },
    removeItem: () => { mirror = null; },
  } as unknown as Storage;
  const createStore = () => createIndexedDbKeyValueStore({
    databaseName: 'cross-tab-test',
    objectStoreName: 'values',
    getIndexedDb: () => factory,
    getLegacyStorage: () => storage,
    getWindow: () => undefined,
    createBroadcastChannel: () => undefined,
  });
  const first = createStore().update('saved', () => ({ value: 'a', result: undefined }));
  const second = createStore().update('saved', (current) => ({
    value: current + ',b',
    result: undefined,
  }));
  await vi.waitFor(() => expect(completions).toHaveLength(2));
  completions[1]();
  await second;
  completions[0]();
  await first;
  expect(authority).toBe('a,b');
  expect(mirror).toBe('a,b');
});

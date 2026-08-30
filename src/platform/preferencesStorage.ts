import { Preferences, type PreferencesPlugin } from '@capacitor/preferences';
import {
  StorageAccessError,
  type KeyValueStore,
  type KeyValueUpdate,
} from './storage';

interface PreferencesKeyValueStoreOptions {
  preferences?: Pick<PreferencesPlugin, 'get' | 'set' | 'remove'>;
  legacyStore?: Pick<KeyValueStore, 'get'>;
  getWindow?: () => Window | undefined;
}

const ENVELOPE_FORMAT = 'soleil.preferences.v1';

interface PreferencesEnvelope {
  format: typeof ENVELOPE_FORMAT;
  value: string | null;
}

function encodeEnvelope(value: string | null): string {
  return JSON.stringify({ format: ENVELOPE_FORMAT, value } satisfies PreferencesEnvelope);
}

function decodeEnvelope(raw: string): PreferencesEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PreferencesEnvelope> | null;
    if (
      parsed?.format === ENVELOPE_FORMAT
      && (typeof parsed.value === 'string' || parsed.value === null)
    ) {
      return { format: ENVELOPE_FORMAT, value: parsed.value };
    }
  } catch {
    // An unwrapped value from an earlier native build is migrated below.
  }
  return null;
}

/**
 * Native Preferences is the durable authority inside the iOS installation.
 * Operations for a key are serialized because UserDefaults does not expose a
 * read-modify-write transaction. A native app has one JavaScript process, so
 * this provides the ordering guarantee required by the saved-spots controller.
 */
export function createPreferencesKeyValueStore({
  preferences = Preferences,
  legacyStore,
  getWindow = () => typeof window === 'undefined' ? undefined : window,
}: PreferencesKeyValueStoreOptions = {}): KeyValueStore {
  const updateTails = new Map<string, Promise<void>>();
  const listeners = new Map<string, Set<() => void>>();

  const runExclusive = async <Result>(key: string, operation: () => Promise<Result>) => {
    const previous = updateTails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    updateTails.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (updateTails.get(key) === tail) updateTails.delete(key);
    }
  };

  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };

  const readOrMigrate = async (key: string): Promise<string | null> => {
    let current: string | null;
    try {
      current = (await preferences.get({ key })).value;
    } catch (cause) {
      throw new StorageAccessError('get', { cause });
    }
    if (current !== null) {
      const envelope = decodeEnvelope(current);
      if (envelope) return envelope.value;
      try {
        // Preserve and wrap a direct value written by an earlier native build.
        await preferences.set({ key, value: encodeEnvelope(current) });
        return current;
      } catch (cause) {
        throw new StorageAccessError('set', { cause });
      }
    }

    try {
      const legacyValue = legacyStore ? await legacyStore.get(key) : null;
      // A null envelope is a durable tombstone. It prevents an older WebView
      // value from being resurrected after an intentional native removal.
      await preferences.set({ key, value: encodeEnvelope(legacyValue) });
      return legacyValue;
    } catch (cause) {
      throw new StorageAccessError('get', { cause });
    }
  };

  const update = async <Result>(
    key: string,
    updater: (current: string | null) => KeyValueUpdate<Result>,
  ): Promise<Result> => runExclusive(key, async () => {
    const current = await readOrMigrate(key);
    const next = updater(current);
    if (next.value !== undefined) {
      try {
        // One UserDefaults write is the complete logical commit, including a
        // durable null. No marker-plus-remove partial state is possible.
        await preferences.set({ key, value: encodeEnvelope(next.value) });
      } catch (cause) {
        throw new StorageAccessError(next.value === null ? 'remove' : 'set', { cause });
      }
      notify(key);
    }
    return next.result;
  });

  return {
    updateConsistency: 'in-process',
    get: (key) => runExclusive(key, () => readOrMigrate(key)),
    set: (key, value) => update(key, () => ({ value, result: undefined })),
    remove: (key) => update(key, () => ({ value: null, result: undefined })),
    update,
    subscribe(key, listener) {
      const keyListeners = listeners.get(key) ?? new Set<() => void>();
      keyListeners.add(listener);
      listeners.set(key, keyListeners);

      const target = getWindow();
      const onResume = () => listener();
      const onVisibility = () => {
        if (target?.document.visibilityState === 'visible') listener();
      };
      target?.addEventListener('pageshow', onResume);
      target?.document.addEventListener('visibilitychange', onVisibility);
      return () => {
        keyListeners.delete(listener);
        if (keyListeners.size === 0) listeners.delete(key);
        target?.removeEventListener('pageshow', onResume);
        target?.document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

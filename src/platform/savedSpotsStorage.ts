import { savedSpotsKeyValueStore as indexedDbSavedSpotsStore } from './indexedDbStorage';
import { createPreferencesKeyValueStore } from './preferencesStorage';
import { isNativeRuntime } from './runtime';
import type { KeyValueStore } from './storage';

export function selectSavedSpotsKeyValueStore(
  native: boolean,
  webStore: KeyValueStore,
  nativeStore: KeyValueStore,
): KeyValueStore {
  return native ? nativeStore : webStore;
}

export const nativeSavedSpotsKeyValueStore = createPreferencesKeyValueStore({
  legacyStore: indexedDbSavedSpotsStore,
});

export const savedSpotsKeyValueStore = selectSavedSpotsKeyValueStore(
  isNativeRuntime(),
  indexedDbSavedSpotsStore,
  nativeSavedSpotsKeyValueStore,
);

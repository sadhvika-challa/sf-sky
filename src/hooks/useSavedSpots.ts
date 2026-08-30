import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { KNOWN_SPOT_IDS, SPOT_ID_ALIASES } from '../data/spotIdentity';
import { browserKeyValueStore, type KeyValueStore } from '../platform/storage';
import {
  FutureSavedSpotsVersionError,
  SAVED_SPOTS_STORAGE_KEY,
  parseSavedSpots,
  persistSavedSpots,
} from '../utils/savedSpots';

export type SavedSpotsError =
  | 'read-failed'
  | 'write-failed'
  | 'future-version';

export interface SavedSpotsState {
  status: 'loading' | 'ready' | 'error' | 'protected';
  savedSpotIds: readonly string[];
  error: SavedSpotsError | null;
}

type Listener = () => void;

const INITIAL_STATE: SavedSpotsState = Object.freeze({
  status: 'loading',
  savedSpotIds: Object.freeze([]),
  error: null,
});

function snapshot(
  status: SavedSpotsState['status'],
  ids: ReadonlySet<string>,
  error: SavedSpotsError | null,
): SavedSpotsState {
  return Object.freeze({
    status,
    savedSpotIds: Object.freeze([...ids]),
    error,
  });
}

/**
 * Framework-independent controller keeps persistence ordering deterministic
 * and makes optimistic rollback testable without a browser renderer.
 */
export class SavedSpotsController {
  private state: SavedSpotsState = INITIAL_STATE;
  private desired = new Set<string>();
  private committed = new Set<string>();
  private listeners = new Set<Listener>();
  private initializePromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private pendingTargets = new Map<string, Promise<boolean>>();

  private readonly store: KeyValueStore;
  private readonly knownIds: ReadonlySet<string>;
  private readonly aliases: Readonly<Record<string, string>>;

  constructor(
    store: KeyValueStore,
    knownIds: ReadonlySet<string>,
    aliases: Readonly<Record<string, string>> = {},
  ) {
    this.store = store;
    this.knownIds = knownIds;
    this.aliases = aliases;
  }

  getSnapshot = (): SavedSpotsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(state: SavedSpotsState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  initialize(): Promise<void> {
    if (!this.initializePromise) this.initializePromise = this.load();
    return this.initializePromise;
  }

  private async load() {
    try {
      const parsed = parseSavedSpots(
        await this.store.get(SAVED_SPOTS_STORAGE_KEY),
        this.knownIds,
        this.aliases,
      );
      if (parsed.kind === 'future-version') {
        this.publish(snapshot('protected', new Set(), 'future-version'));
        return;
      }

      this.desired = new Set(parsed.spotIds);
      this.committed = new Set(parsed.spotIds);
      this.publish(snapshot(
        parsed.kind === 'corrupt' ? 'error' : 'ready',
        this.desired,
        parsed.kind === 'corrupt' ? 'read-failed' : null,
      ));

      if (parsed.kind === 'loaded' && parsed.needsRewrite) {
        try {
          await persistSavedSpots(this.store, parsed.spotIds, this.knownIds, this.aliases);
        } catch (error) {
          if (error instanceof FutureSavedSpotsVersionError) {
            this.publish(snapshot('protected', new Set(), 'future-version'));
          } else {
            this.publish(snapshot('error', this.desired, 'write-failed'));
          }
        }
      }
    } catch {
      this.desired = new Set();
      this.committed = new Set();
      this.publish(snapshot('error', this.desired, 'read-failed'));
    }
  }

  async rehydrate(): Promise<void> {
    await this.initialize();
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const parsed = parseSavedSpots(
          await this.store.get(SAVED_SPOTS_STORAGE_KEY),
          this.knownIds,
          this.aliases,
        );
        if (parsed.kind === 'future-version') {
          this.desired = new Set();
          this.committed = new Set();
          this.publish(snapshot('protected', this.desired, 'future-version'));
          return;
        }
        if (parsed.kind === 'corrupt') {
          this.desired = new Set();
          this.committed = new Set();
          this.publish(snapshot('error', this.desired, 'read-failed'));
          return;
        }
        this.desired = new Set(parsed.spotIds);
        this.committed = new Set(parsed.spotIds);
        this.publish(snapshot('ready', this.desired, null));
      } catch {
        this.publish(snapshot('error', this.desired, 'read-failed'));
      }
    });
    return this.writeQueue;
  }

  setSaved(spotId: string, saved: boolean): Promise<boolean> {
    return this.setSavedInternal(spotId, saved);
  }

  private async setSavedInternal(spotId: string, saved: boolean): Promise<boolean> {
    await this.initialize();
    if (this.state.status === 'protected' || !this.knownIds.has(spotId)) return false;

    const alreadyDesired = this.desired.has(spotId);
    if (alreadyDesired === saved) {
      const pending = this.pendingTargets.get(`${spotId}:${saved}`);
      return pending ?? true;
    }

    const target = new Set(this.desired);
    if (saved) target.add(spotId);
    else target.delete(spotId);
    this.desired = target;
    this.publish(snapshot('ready', this.desired, null));

    const targetKey = `${spotId}:${saved}`;
    const write = this.writeQueue.then(async () => {
      try {
        await persistSavedSpots(this.store, [...target], this.knownIds, this.aliases);
        this.committed = new Set(target);
        if (this.desired === target) {
          this.publish(snapshot('ready', this.desired, null));
        }
        return true;
      } catch (error) {
        if (this.desired === target) this.desired = new Set(this.committed);
        const future = error instanceof FutureSavedSpotsVersionError;
        this.publish(snapshot(
          future ? 'protected' : 'error',
          this.desired,
          future ? 'future-version' : 'write-failed',
        ));
        return false;
      } finally {
        if (this.pendingTargets.get(targetKey) === write) {
          this.pendingTargets.delete(targetKey);
        }
      }
    });
    this.pendingTargets.set(targetKey, write);
    this.writeQueue = write.then(() => undefined);
    return write;
  }
}

export interface UseSavedSpotsOptions {
  store?: KeyValueStore;
  knownIds?: ReadonlySet<string>;
  aliases?: Readonly<Record<string, string>>;
}

export interface UseSavedSpotsResult extends SavedSpotsState {
  isSaved: (spotId: string) => boolean;
  save: (spotId: string) => Promise<boolean>;
  unsave: (spotId: string) => Promise<boolean>;
  toggle: (spotId: string) => Promise<boolean>;
  rehydrate: () => Promise<void>;
}

export function useSavedSpots(
  options: UseSavedSpotsOptions = {},
): UseSavedSpotsResult {
  const store = options.store ?? browserKeyValueStore;
  const knownIds = options.knownIds ?? KNOWN_SPOT_IDS;
  const aliases = options.aliases ?? SPOT_ID_ALIASES;
  const controller = useMemo(
    () => new SavedSpotsController(store, knownIds, aliases),
    [aliases, knownIds, store],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.initialize();
    return store.subscribe?.(SAVED_SPOTS_STORAGE_KEY, () => {
      void controller.rehydrate();
    });
  }, [controller, store]);

  const isSaved = useCallback(
    (spotId: string) => state.savedSpotIds.includes(spotId),
    [state.savedSpotIds],
  );
  const save = useCallback(
    (spotId: string) => controller.setSaved(spotId, true),
    [controller],
  );
  const unsave = useCallback(
    (spotId: string) => controller.setSaved(spotId, false),
    [controller],
  );
  const toggle = useCallback(
    (spotId: string) => controller.setSaved(spotId, !state.savedSpotIds.includes(spotId)),
    [controller, state.savedSpotIds],
  );

  return {
    ...state,
    isSaved,
    save,
    unsave,
    toggle,
    rehydrate: () => controller.rehydrate(),
  };
}

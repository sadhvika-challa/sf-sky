import type { KeyValueStore } from '../platform/storage';

export const SAVED_SPOTS_STORAGE_KEY = 'soleil:saved-spots';
export const SAVED_SPOTS_VERSION = 1 as const;

export interface SavedSpotsPayloadV1 {
  version: typeof SAVED_SPOTS_VERSION;
  spotIds: string[];
}

export type SavedSpotsParseResult =
  | { kind: 'missing'; spotIds: []; needsRewrite: false }
  | { kind: 'loaded'; spotIds: string[]; needsRewrite: boolean }
  | { kind: 'corrupt'; spotIds: []; needsRewrite: false }
  | { kind: 'future-version'; version: number; spotIds: []; needsRewrite: false };

export class FutureSavedSpotsVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(`Saved spots were written by unsupported version ${version}.`);
    this.name = 'FutureSavedSpotsVersionError';
    this.version = version;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function legacyIds(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.spotIds)) return value.spotIds;
  if (Array.isArray(value.savedSpotIds)) return value.savedSpotIds;
  if (Array.isArray(value.spots)) return value.spots;
  return null;
}

function resolveAlias(
  id: string,
  aliases: Readonly<Record<string, string>>,
): string | null {
  let resolved = id;
  const visited = new Set<string>();
  while (aliases[resolved] !== undefined) {
    if (visited.has(resolved)) return null;
    visited.add(resolved);
    resolved = aliases[resolved];
  }
  return resolved;
}

export function normalizeSavedSpotIds(
  values: readonly unknown[],
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const aliased = resolveAlias(value, aliases);
    if (!aliased || !knownIds.has(aliased) || seen.has(aliased)) continue;
    seen.add(aliased);
    normalized.push(aliased);
  }
  return normalized;
}

function sameStringArray(left: readonly unknown[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseSavedSpots(
  raw: string | null,
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
): SavedSpotsParseResult {
  if (raw === null) return { kind: 'missing', spotIds: [], needsRewrite: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', spotIds: [], needsRewrite: false };
  }

  if (isRecord(parsed) && typeof parsed.version === 'number' && parsed.version > SAVED_SPOTS_VERSION) {
    return {
      kind: 'future-version',
      version: parsed.version,
      spotIds: [],
      needsRewrite: false,
    };
  }

  const ids = legacyIds(parsed);
  if (!ids) return { kind: 'corrupt', spotIds: [], needsRewrite: false };

  const version = isRecord(parsed) ? parsed.version : undefined;
  if (version !== undefined && version !== 0 && version !== SAVED_SPOTS_VERSION) {
    return { kind: 'corrupt', spotIds: [], needsRewrite: false };
  }

  const spotIds = normalizeSavedSpotIds(ids, knownIds, aliases);
  const isCurrentShape = isRecord(parsed)
    && parsed.version === SAVED_SPOTS_VERSION
    && Array.isArray(parsed.spotIds);
  return {
    kind: 'loaded',
    spotIds,
    needsRewrite: !isCurrentShape || !sameStringArray(ids, spotIds),
  };
}

export function serializeSavedSpots(spotIds: readonly string[]): string {
  const payload: SavedSpotsPayloadV1 = {
    version: SAVED_SPOTS_VERSION,
    spotIds: [...spotIds],
  };
  return JSON.stringify(payload);
}

/** Read-before-write prevents an unknown future payload from being destroyed. */
export async function persistSavedSpots(
  store: KeyValueStore,
  spotIds: readonly string[],
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
): Promise<void> {
  const current = parseSavedSpots(
    await store.get(SAVED_SPOTS_STORAGE_KEY),
    knownIds,
    aliases,
  );
  if (current.kind === 'future-version') {
    throw new FutureSavedSpotsVersionError(current.version);
  }
  const normalized = normalizeSavedSpotIds(spotIds, knownIds, aliases);
  await store.set(SAVED_SPOTS_STORAGE_KEY, serializeSavedSpots(normalized));
}

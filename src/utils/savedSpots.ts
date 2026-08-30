import type { KeyValueStore } from '../platform/storage';

export const SAVED_SPOTS_STORAGE_KEY = 'soleil:saved-spots';
export const SAVED_SPOTS_VERSION = 1 as const;

export interface SavedSpotsPayloadV1 {
  version: typeof SAVED_SPOTS_VERSION;
  spotIds: string[];
}

export type SavedSpotsParseResult =
  | { kind: 'missing'; spotIds: []; opaqueSpotIds: []; needsRewrite: false }
  | { kind: 'loaded'; spotIds: string[]; opaqueSpotIds: string[]; needsRewrite: boolean }
  | { kind: 'corrupt'; spotIds: []; opaqueSpotIds: []; needsRewrite: false }
  | { kind: 'future-version'; version: number; spotIds: []; opaqueSpotIds: []; needsRewrite: false };

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
): string {
  let resolved = id;
  const visited = new Set<string>();
  while (aliases[resolved] !== undefined) {
    if (visited.has(resolved)) return id;
    visited.add(resolved);
    resolved = aliases[resolved];
  }
  return resolved;
}

export interface ClassifiedSavedSpotIds {
  spotIds: string[];
  opaqueSpotIds: string[];
}

export function classifySavedSpotIds(
  values: readonly unknown[],
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
  retiredIds: ReadonlySet<string> = new Set(),
): ClassifiedSavedSpotIds {
  const spotIds: string[] = [];
  const opaqueSpotIds: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) continue;
    const aliased = resolveAlias(value, aliases);
    if (retiredIds.has(value) || retiredIds.has(aliased) || seen.has(aliased)) continue;
    seen.add(aliased);
    if (knownIds.has(aliased)) spotIds.push(aliased);
    else opaqueSpotIds.push(aliased);
  }
  return { spotIds, opaqueSpotIds };
}

export function normalizeSavedSpotIds(
  values: readonly unknown[],
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
  retiredIds: ReadonlySet<string> = new Set(),
): string[] {
  return classifySavedSpotIds(values, knownIds, aliases, retiredIds).spotIds;
}

function sameStringArray(left: readonly unknown[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseSavedSpots(
  raw: string | null,
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
  retiredIds: ReadonlySet<string> = new Set(),
): SavedSpotsParseResult {
  if (raw === null) {
    return { kind: 'missing', spotIds: [], opaqueSpotIds: [], needsRewrite: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', spotIds: [], opaqueSpotIds: [], needsRewrite: false };
  }

  if (isRecord(parsed) && typeof parsed.version === 'number' && parsed.version > SAVED_SPOTS_VERSION) {
    return {
      kind: 'future-version',
      version: parsed.version,
      spotIds: [],
      opaqueSpotIds: [],
      needsRewrite: false,
    };
  }

  const ids = legacyIds(parsed);
  if (!ids) {
    return { kind: 'corrupt', spotIds: [], opaqueSpotIds: [], needsRewrite: false };
  }

  const version = isRecord(parsed) ? parsed.version : undefined;
  if (version !== undefined && version !== 0 && version !== SAVED_SPOTS_VERSION) {
    return { kind: 'corrupt', spotIds: [], opaqueSpotIds: [], needsRewrite: false };
  }

  const { spotIds, opaqueSpotIds } = classifySavedSpotIds(
    ids,
    knownIds,
    aliases,
    retiredIds,
  );
  const storedIds = [...spotIds, ...opaqueSpotIds];
  const isCurrentShape = isRecord(parsed)
    && parsed.version === SAVED_SPOTS_VERSION
    && Array.isArray(parsed.spotIds);
  return {
    kind: 'loaded',
    spotIds,
    opaqueSpotIds,
    needsRewrite: !isCurrentShape || !sameStringArray(ids, storedIds),
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
  opaqueSpotIds: readonly string[],
  knownIds: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>> = {},
  retiredIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const current = parseSavedSpots(
    await store.get(SAVED_SPOTS_STORAGE_KEY),
    knownIds,
    aliases,
    retiredIds,
  );
  if (current.kind === 'future-version') {
    throw new FutureSavedSpotsVersionError(current.version);
  }
  const normalized = classifySavedSpotIds(
    [
      ...spotIds,
      ...opaqueSpotIds,
      ...(current.kind === 'loaded' ? current.opaqueSpotIds : []),
    ],
    knownIds,
    aliases,
    retiredIds,
  );
  await store.set(SAVED_SPOTS_STORAGE_KEY, serializeSavedSpots([
    ...normalized.spotIds,
    ...normalized.opaqueSpotIds,
  ]));
}

import { allSpots } from './all-spots';

export const KNOWN_SPOT_IDS: ReadonlySet<string> = new Set(
  allSpots.map((spot) => spot.id),
);

/**
 * Add retired stable IDs here when a catalog rename is unavoidable. Aliases
 * are intentionally ID-to-ID. Display names are never persistence keys.
 */
export const SPOT_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({});

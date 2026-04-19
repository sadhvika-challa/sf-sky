// Karl voice for per-spot score commentary. Picks a deterministic line per
// (spotId, day) so the same spot reads the same all session, but spots vary.

import type { ScoreType } from './scoring';

type Bucket = 'incredible' | 'great' | 'decent' | 'meh' | 'bad' | 'terrible';

const SUN_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'Absolutely unhinged sky. Go now.',
    'Karl evaporated. Sky is showing off.',
    "This is the one. Don't be on your phone.",
    'Main character sky. Move.',
  ],
  great: [
    'Karl fumbled. Your win.',
    'Karl forgot to set an alarm. Cash in.',
    'Strong sky energy. Worth the trip.',
    'Karl took the L. Get a good seat.',
  ],
  decent: [
    "Not bad. Karl's being chill for once.",
    'Solid B+. Karl is somewhere else right now.',
    "Won't make the group chat, but worth stepping outside.",
    "Karl's around but he's not committing.",
  ],
  meh: [
    "Karl's hovering. Could go either way.",
    'Coin flip. Karl is undecided.',
    "Mid sky. Bring snacks just in case.",
    'Karl is workshopping. No promises.',
  ],
  bad: [
    "Karl's setting up camp. Probably skip it.",
    "Karl rolled in. Don't get your hopes up.",
    "Karl's parked over this spot. Pick somewhere else.",
    "It's mostly Karl out there. Just being honest.",
  ],
  terrible: [
    'Karl said no.',
    'Karl wins. Move on.',
    'Pure Karl. Stay inside.',
    'Karl ate the sky.',
  ],
};

const STAR_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'Karl left the city. Stars are putting on a show.',
    'Sky is wide open. Karl is nowhere.',
    'Find a dark spot. Tonight delivers.',
    'Karl skipped town. Look up.',
  ],
  great: [
    "Karl's out. Solid stargazing night.",
    'Clear-ish skies. Karl is staying out of it.',
    "Bring a blanket. Karl's not invited.",
    "Karl's off duty. Stars are doing their thing.",
  ],
  decent: [
    "Some haze but you'll see the bright ones.",
    "Karl's a little in the way. Still worth a look.",
    'Constellations are findable. Karl is a soft filter.',
    "Not pristine, but you'll see something.",
  ],
  meh: [
    "Karl's doing his thing. Bring low expectations.",
    "Half sky, half Karl. Pick a hill.",
    'Patchy. Karl is being annoying.',
    "Maybe a few stars. Mostly Karl's vibe.",
  ],
  bad: [
    'Karl and the moon are teaming up against you.',
    "Karl's heavy tonight. Stars are losing.",
    "It's Karl's sky now.",
    "Don't drive far. Karl is winning.",
  ],
  terrible: [
    'Karl wins. Stay in.',
    'No sky. Just Karl.',
    "Karl ate the stars too.",
    'Tonight is a Karl night. Skip it.',
  ],
};

function bucketFor(score: number): Bucket {
  if (score >= 90) return 'incredible';
  if (score >= 75) return 'great';
  if (score >= 60) return 'decent';
  if (score >= 40) return 'meh';
  if (score >= 20) return 'bad';
  return 'terrible';
}

// Tiny string hash (FNV-1a, 32-bit). Stable across sessions, good enough to
// shuffle which variant a given (spotId, day) lands on.
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns a short, in-character Karl line for a spot's live score. Same
 * spot/day pair yields the same line; different spots get variety.
 */
export function getKarlComment(
  score: number,
  eventType: ScoreType,
  spotId: number,
  date: Date = new Date(),
): string {
  const bucket = bucketFor(score);
  const lines = eventType === 'stargazing' ? STAR_LINES[bucket] : SUN_LINES[bucket];
  const idx = hash(`${spotId}|${eventType}|${todayKey(date)}`) % lines.length;
  return lines[idx];
}

// Per-spot score commentary. Karl voice for SF, neutral sky language for Austin.
// Picks a deterministic line per (spotId, day) so the same spot reads the same
// all session, but spots vary.

import type { City } from '../data/spots';
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

const ATX_SUN_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'This is going to be incredible.',
    'Clear skies and wide open views.',
    'The Hill Country sky is showing off tonight.',
    'Perfect conditions. Get out there.',
  ],
  great: [
    'Looking really good tonight.',
    'Worth the drive.',
    'Strong conditions. Should be a great show.',
    'The sky is cooperating. Enjoy it.',
  ],
  decent: [
    'Decent conditions. Could be nice.',
    'Not bad at all.',
    'Solid evening for it. Worth a look.',
    'Should be pleasant out there.',
  ],
  meh: [
    'Might want to check the forecast first.',
    'Could go either way.',
    'Mixed signals. Bring low expectations.',
    'Not the best, not the worst.',
  ],
  bad: [
    'Probably not worth the trip tonight.',
    'Save it for a better evening.',
    'Conditions aren\'t looking great.',
    'Maybe stay closer to home tonight.',
  ],
  terrible: [
    'Skip it tonight.',
    'The sky\'s not cooperating.',
    'Not happening tonight. Try again tomorrow.',
    'Overcast and hazy. Save your gas.',
  ],
};

const ATX_STAR_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'Dark skies and clear conditions. Perfect.',
    'The stars are putting on a show tonight.',
    'Couldn\'t ask for better stargazing weather.',
    'Wide open and crystal clear. Look up.',
  ],
  great: [
    'Solid stargazing night. Get somewhere dark.',
    'Clear enough for a good session.',
    'The sky is cooperating. Bring a blanket.',
    'Good visibility tonight. Worth the drive.',
  ],
  decent: [
    'Some haze but you\'ll see the bright ones.',
    'Not pristine, but still worth a look.',
    'Decent enough. Pick a darker spot.',
    'Constellations are findable tonight.',
  ],
  meh: [
    'Patchy clouds. Bring low expectations.',
    'Half clear, half not. Could be frustrating.',
    'Maybe a few stars. Maybe not.',
    'Mixed conditions for stargazing.',
  ],
  bad: [
    'Too much cloud cover tonight.',
    'Not great for stars. Try another night.',
    'The clouds are winning.',
    'Don\'t drive far. Save it for clearer skies.',
  ],
  terrible: [
    'No stars tonight. Completely overcast.',
    'Skip stargazing tonight.',
    'The sky is shut. Try again tomorrow.',
    'Total cloud cover. Nothing to see.',
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
 * Returns a short commentary line for a spot's live score. Karl voice for SF,
 * neutral sky language for Austin. Same spot/day pair yields the same line;
 * different spots get variety.
 */
export function getKarlComment(
  score: number,
  eventType: ScoreType,
  spotId: string,
  date: Date = new Date(),
  city: City = 'sf',
): string {
  const bucket = bucketFor(score);
  let lines: readonly string[];
  if (city === 'austin') {
    lines = eventType === 'stargazing' ? ATX_STAR_LINES[bucket] : ATX_SUN_LINES[bucket];
  } else {
    lines = eventType === 'stargazing' ? STAR_LINES[bucket] : SUN_LINES[bucket];
  }
  const idx = hash(`${spotId}|${eventType}|${todayKey(date)}`) % lines.length;
  return lines[idx];
}

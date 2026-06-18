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

const NOW_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'Not a wisp. Go sit in it.',
    'Karl called in sick. Enjoy.',
    'Blue sky, no strings attached.',
    'Karl who? Get outside.',
  ],
  great: [
    'Karl is off the clock. Nice out.',
    'Clear enough to forget Karl exists.',
    'Good vibes. Karl is someone else\'s problem.',
    'Sun is doing its thing. Karl is not.',
  ],
  decent: [
    'Some clouds but Karl is keeping his distance.',
    'Not perfect, but you won\'t complain.',
    'Karl is lurking on the edges. Still fine.',
    'Enough blue sky to be worth it.',
  ],
  meh: [
    'Karl is circling. Could go either way.',
    'Gray patches. Bring optimism.',
    'Karl is being passive-aggressive about it.',
    'Half Karl, half sky. Pick your battles.',
  ],
  bad: [
    'Karl is settling in. Find a cafe.',
    'Mostly Karl out there. Indoor vibes.',
    'Karl is committed. Respect it.',
    'Gray on gray. Karl is winning.',
  ],
  terrible: [
    'Karl won. Stay in.',
    'Pure Karl. Zero sky.',
    'Karl ate the sun.',
    'Karl is the sky now.',
  ],
};

const ATX_NOW_LINES: Record<Bucket, readonly string[]> = {
  incredible: [
    'Wide open and gorgeous. Get out there.',
    'Not a cloud in sight.',
    'Perfect day. No excuses.',
    'Crystal clear. Enjoy it.',
  ],
  great: [
    'Looking great out there.',
    'Clear and comfortable.',
    'Solid day to be outside.',
    'Sky is cooperating. Enjoy.',
  ],
  decent: [
    'Some clouds but still pleasant.',
    'Not bad at all. Worth going out.',
    'Enough sun to enjoy it.',
    'Decent conditions. Get some air.',
  ],
  meh: [
    'Could go either way today.',
    'Mixed signals from the sky.',
    'Not great, not terrible.',
    'Patchy. Bring a good attitude.',
  ],
  bad: [
    'Mostly overcast. Maybe stay close.',
    'Not the best day for it.',
    'Gray and uninspiring.',
    'The sky is not cooperating.',
  ],
  terrible: [
    'Skip it. Try again tomorrow.',
    'Not happening today.',
    'The sky said no.',
    'Stay in. Nothing to see.',
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
  eventType: ScoreType | 'now',
  spotId: string,
  date: Date = new Date(),
  city: City = 'sf',
): string {
  const bucket = bucketFor(score);
  let lines: readonly string[];
  if (eventType === 'now') {
    lines = (city === 'austin' || city === 'santa-cruz') ? ATX_NOW_LINES[bucket] : NOW_LINES[bucket];
  } else if (city === 'austin' || city === 'santa-cruz') {
    lines = eventType === 'stargazing' ? ATX_STAR_LINES[bucket] : ATX_SUN_LINES[bucket];
  } else {
    lines = eventType === 'stargazing' ? STAR_LINES[bucket] : SUN_LINES[bucket];
  }
  const idx = hash(`${spotId}|${eventType}|${todayKey(date)}`) % lines.length;
  return lines[idx];
}

// ── Karl 2x2 breakdown (sun events only) ────────────────────────────────
// Maps the (spot tier, sky tier) pair to a Karl-voiced one-liner that
// explains *why* the score is what it is, not just *what* it is. Tiers
// use the same getScoreTier thresholds (>= 70 / 45-69 / < 45).

export type BreakdownTier = 'good' | 'mixed' | 'poor';

const KARL_BREAKDOWN_GRID: Record<BreakdownTier, Record<BreakdownTier, string>> = {
  good: {
    good: "Great spot, great sky. Karl clocked out. Go.",
    mixed: "The spot's doing its part. Karl can't decide.",
    poor: "Killer spot, but Karl owns the sky tonight.",
  },
  mixed: {
    good: "The sky's carrying this one. Even an okay spot works tonight.",
    mixed: "Coin flip. Karl likes it that way.",
    poor: "Skip it. Karl took the night.",
  },
  poor: {
    good: "Sky's gorgeous. This just isn't the seat for it. Try a hilltop.",
    mixed: "Not the spot, not the night.",
    poor: "Hard no from Karl on every axis.",
  },
};

function toBreakdownTier(score: number): BreakdownTier {
  if (score >= 70) return 'good';
  if (score >= 45) return 'mixed';
  return 'poor';
}

/**
 * Karl-voiced line for the 3x3 (spot quality, sky quality) grid.
 * Only meaningful for sun events where the breakdown splits cleanly.
 */
export function getKarlBreakdownLine(baseScore: number, weatherScore: number): string {
  return KARL_BREAKDOWN_GRID[toBreakdownTier(baseScore)][toBreakdownTier(weatherScore)];
}

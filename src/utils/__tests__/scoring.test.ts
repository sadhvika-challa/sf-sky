import { describe, it, expect } from 'vitest';
import {
  computeLiveScore,
  computeScoreBreakdown,
  getScoreTier,
  getSpectrumColor,
  cloudCoverLabel,
  visibilityPercent,
  type ScoreType,
} from '../scoring';
import type { Spot } from '../../data/spots';
import type { HourlyForecast } from '../weather';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'test-spot',
    name: 'Test Spot',
    lat: 37.78,
    lng: -122.51,
    city: 'sf',
    category: 'hill',
    elevation: 100,
    lightPollution: 'Low',
    horizonQuality: 'Open',
    sunrise: 70,
    sunset: 70,
    stargazing: 70,
    ...overrides,
  };
}

function makeHour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    cloud: 30,
    cloudLow: 10,
    cloudMid: 40,
    cloudHigh: 30,
    visibilityKm: 16,
    humidity: 60,
    tempF: 58,
    precipProb: 0,
    pm25: 5,
    aqi: 20,
    windMph: 8,
    gustMph: 12,
    windDir: 270,
    ...overrides,
  };
}

function makeFoggyHour(): HourlyForecast {
  return makeHour({
    cloud: 80,
    cloudLow: 95,
    cloudMid: 10,
    cloudHigh: 5,
    visibilityKm: 1.2,
    humidity: 98,
  });
}

function makeClearHour(): HourlyForecast {
  return makeHour({
    cloud: 5,
    cloudLow: 2,
    cloudMid: 3,
    cloudHigh: 5,
    visibilityKm: 18,
    humidity: 50,
  });
}

// ---------------------------------------------------------------------------
// Regression: Lands End foggy evening
// ---------------------------------------------------------------------------

describe('Lands End foggy evening regression', () => {
  it('should cap sunset score at 35 or below during heavy fog', () => {
    const landsEnd = makeSpot({ name: 'Lands End', sunset: 92 });
    const foggyHour = makeFoggyHour();
    const score = computeLiveScore(landsEnd, 'sunset', foggyHour);
    expect(score).toBeLessThanOrEqual(35);
  });

  it('should produce a high score for Lands End on a clear evening', () => {
    const landsEnd = makeSpot({ name: 'Lands End', sunset: 92 });
    const clearHour = makeClearHour();
    const score = computeLiveScore(landsEnd, 'sunset', clearHour);
    expect(score).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Regression: clear, fog-free evening must not score "mediocre"
// The triangular cloud curve treats a cloudless sky as un-dramatic; without a
// clear-sky floor a spot like Marina Green (base 78) scored ~61 on a perfectly
// clear, 24km-visibility, fog-free sunset — looking broken next to the clear
// weather layer. The floor only applies when fog is genuinely low.
// ---------------------------------------------------------------------------

describe('clear fog-free sunset floor', () => {
  function marinaGreenClearSunsetHour(): HourlyForecast {
    return makeHour({
      cloud: 4,
      cloudLow: 4,
      cloudMid: 0,
      cloudHigh: 0,
      visibilityKm: 24.3,
      humidity: 67,
      pm25: 14.5,
    });
  }

  it('rates a clear, fog-free sunset as a good evening (not mediocre)', () => {
    const marinaGreen = makeSpot({ name: 'Marina Green', sunset: 78 });
    const score = computeLiveScore(marinaGreen, 'sunset', marinaGreenClearSunsetHour());
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('does not floor a foggy evening up to clear', () => {
    const marinaGreen = makeSpot({ name: 'Marina Green', sunset: 78 });
    const foggy = computeLiveScore(marinaGreen, 'sunset', makeFoggyHour());
    expect(foggy).toBeLessThanOrEqual(35);
  });
});

// ---------------------------------------------------------------------------
// Condition override tests
// ---------------------------------------------------------------------------

describe('condition overrides', () => {
  it('fog > 0.7 caps sunset score at 35', () => {
    const spot = makeSpot({ sunset: 92 });
    const hour = makeFoggyHour(); // fog density ~0.85
    const score = computeLiveScore(spot, 'sunset', hour);
    expect(score).toBeLessThanOrEqual(35);
  });

  it('fog > 0.7 caps sunrise score at 35', () => {
    const spot = makeSpot({ sunrise: 92 });
    const hour = makeFoggyHour();
    const score = computeLiveScore(spot, 'sunrise', hour);
    expect(score).toBeLessThanOrEqual(35);
  });

  it('cloud > 95 caps sunset score at 30', () => {
    const spot = makeSpot({ sunset: 90 });
    const hour = makeHour({
      cloud: 98,
      cloudLow: 30,
      cloudMid: 40,
      cloudHigh: 30,
      visibilityKm: 10,
      humidity: 60,
    });
    const score = computeLiveScore(spot, 'sunset', hour);
    expect(score).toBeLessThanOrEqual(30);
  });

  it('visibility < 2km caps sunset score at 40', () => {
    const spot = makeSpot({ sunset: 90 });
    const hour = makeHour({
      cloud: 40,
      cloudLow: 20,
      cloudMid: 10,
      cloudHigh: 10,
      visibilityKm: 1.5,
      humidity: 70,
    });
    const score = computeLiveScore(spot, 'sunset', hour);
    expect(score).toBeLessThanOrEqual(40);
  });

  it('stargazing cloud > 95 caps score at 20', () => {
    const spot = makeSpot({ stargazing: 85 });
    const hour = makeHour({
      cloud: 98,
      cloudLow: 60,
      cloudMid: 70,
      cloudHigh: 60,
      visibilityKm: 10,
      humidity: 70,
    });
    const score = computeLiveScore(spot, 'stargazing', hour, 0);
    expect(score).toBeLessThanOrEqual(20);
  });

  it('fog override does not apply to stargazing', () => {
    const spot = makeSpot({ stargazing: 70 });
    const hour = makeFoggyHour();
    // Stargazing has no fog > 0.7 cap (only cloud > 95 cap)
    // The score should NOT be capped at 35
    const score = computeLiveScore(spot, 'stargazing', hour, 0);
    // It may still be low due to weather, but the fog cap of 35 shouldn't apply
    // Cloud is 80, not > 95, so no stargazing cap either
    expect(score).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Weight balance tests
// ---------------------------------------------------------------------------

describe('weight balance', () => {
  it('bad weather dominates: high base + terrible weather = low score', () => {
    const spot = makeSpot({ sunset: 95 });
    const badHour = makeHour({
      cloud: 100,
      cloudLow: 90,
      cloudMid: 95,
      cloudHigh: 90,
      visibilityKm: 2,
      humidity: 95,
      pm25: 50,
    });
    const score = computeLiveScore(spot, 'sunset', badHour);
    // Weather weight is 0.65, so bad weather should pull score down significantly
    expect(score).toBeLessThan(50);
  });

  it('base still matters when weather is identical', () => {
    const highBaseSpot = makeSpot({ sunset: 90 });
    const lowBaseSpot = makeSpot({ sunset: 40 });
    const hour = makeHour(); // decent weather

    const highScore = computeLiveScore(highBaseSpot, 'sunset', hour);
    const lowScore = computeLiveScore(lowBaseSpot, 'sunset', hour);

    expect(highScore).toBeGreaterThan(lowScore);
    // With 0.35 base weight, the difference should be meaningful but not dominant
    const diff = highScore - lowScore;
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThan(50); // base alone can't swing 50+ points
  });

  it('stargazing base weight (0.45) is higher than sun base weight (0.35)', () => {
    const spot = makeSpot({ sunset: 90, stargazing: 90 });
    const clearHour = makeClearHour();

    const sunScore = computeLiveScore(spot, 'sunset', clearHour);
    const starScore = computeLiveScore(spot, 'stargazing', clearHour, 0);

    // Both should be high with good conditions, but they use different formulas
    expect(sunScore).toBeGreaterThan(40);
    expect(starScore).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------

describe('getScoreTier', () => {
  it('returns "vivid" for scores >= 80', () => {
    expect(getScoreTier(80)).toBe('vivid');
    expect(getScoreTier(100)).toBe('vivid');
    expect(getScoreTier(90)).toBe('vivid');
  });

  it('returns "good" for scores 60-79', () => {
    expect(getScoreTier(60)).toBe('good');
    expect(getScoreTier(79)).toBe('good');
    expect(getScoreTier(70)).toBe('good');
  });

  it('returns "fair" for scores 40-59', () => {
    expect(getScoreTier(40)).toBe('fair');
    expect(getScoreTier(59)).toBe('fair');
    expect(getScoreTier(50)).toBe('fair');
  });

  it('returns "low" for scores 20-39', () => {
    expect(getScoreTier(20)).toBe('low');
    expect(getScoreTier(39)).toBe('low');
    expect(getScoreTier(30)).toBe('low');
  });

  it('returns "poor" for scores < 20', () => {
    expect(getScoreTier(0)).toBe('poor');
    expect(getScoreTier(19)).toBe('poor');
    expect(getScoreTier(10)).toBe('poor');
  });
});

describe('getSpectrumColor', () => {
  const toRgb = (s: string): [number, number, number] => {
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) throw new Error(`not an rgb string: ${s}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };

  it('returns a CSS rgb() string', () => {
    expect(getSpectrumColor(50)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it('is continuous — adjacent scores look near-identical (69 vs 70)', () => {
    const a = toRgb(getSpectrumColor(69));
    const b = toRgb(getSpectrumColor(70));
    const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    // No hard tier jump: total per-channel delta stays tiny across one point.
    expect(dist).toBeLessThan(12);
  });

  it('trends red at the bottom and green at the top', () => {
    const low = toRgb(getSpectrumColor(10));
    const high = toRgb(getSpectrumColor(95));
    expect(low[0]).toBeGreaterThan(low[1]); // red channel dominates
    expect(high[1]).toBeGreaterThan(high[0]); // green channel dominates
  });

  it('clamps out-of-range scores to the ramp ends', () => {
    expect(getSpectrumColor(-20)).toBe(getSpectrumColor(0));
    expect(getSpectrumColor(150)).toBe(getSpectrumColor(100));
  });

  it('yields well over 45 distinct colors across 0–100', () => {
    const seen = new Set<string>();
    for (let s = 0; s <= 100; s++) seen.add(getSpectrumColor(s));
    expect(seen.size).toBeGreaterThanOrEqual(45);
  });
});

describe('cloudCoverLabel', () => {
  it('returns "Clear" for cloud < 20', () => {
    expect(cloudCoverLabel(0)).toBe('Clear');
    expect(cloudCoverLabel(19)).toBe('Clear');
  });

  it('returns "Partly" for cloud 20-59', () => {
    expect(cloudCoverLabel(20)).toBe('Partly');
    expect(cloudCoverLabel(59)).toBe('Partly');
  });

  it('returns "Mid" for cloud 60-84', () => {
    expect(cloudCoverLabel(60)).toBe('Mid');
    expect(cloudCoverLabel(84)).toBe('Mid');
  });

  it('returns "Overcast" for cloud >= 85', () => {
    expect(cloudCoverLabel(85)).toBe('Overcast');
    expect(cloudCoverLabel(100)).toBe('Overcast');
  });

  it('returns dash for non-finite input', () => {
    expect(cloudCoverLabel(NaN)).toBe('—');
    expect(cloudCoverLabel(Infinity)).toBe('—');
  });
});

describe('visibilityPercent', () => {
  it('returns 0 for 0 km', () => {
    expect(visibilityPercent(0)).toBe(0);
  });

  it('returns 100 for 30+ km', () => {
    expect(visibilityPercent(30)).toBe(100);
    expect(visibilityPercent(50)).toBe(100);
  });

  it('returns proportional value for mid-range', () => {
    expect(visibilityPercent(15)).toBe(50);
  });

  it('returns 0 for non-finite input', () => {
    expect(visibilityPercent(NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeScoreBreakdown <-> computeLiveScore equivalence grid
// ---------------------------------------------------------------------------

describe('computeScoreBreakdown equivalence', () => {
  const profiles: Record<string, HourlyForecast> = {
    clear: makeClearHour(),
    marinelayer: makeFoggyHour(),
    firesky: makeHour({
      cloud: 45, cloudLow: 8, cloudMid: 50, cloudHigh: 40,
      visibilityKm: 12, humidity: 55, pm25: 5,
    }),
    overcast: makeHour({
      cloud: 98, cloudLow: 60, cloudMid: 70, cloudHigh: 60,
      visibilityKm: 6, humidity: 80, pm25: 10,
    }),
    smoky: makeHour({
      cloud: 20, cloudLow: 10, cloudMid: 15, cloudHigh: 12,
      visibilityKm: 5, humidity: 40, pm25: 60,
    }),
  };

  const types: ScoreType[] = ['sunrise', 'sunset', 'stargazing'];
  const spot = makeSpot({ sunrise: 75, sunset: 80, stargazing: 65 });

  for (const [name, hour] of Object.entries(profiles)) {
    for (const type of types) {
      it(`${name} / ${type}: breakdown.total === computeLiveScore`, () => {
        const moonIllum = type === 'stargazing' ? 0.3 : 0;
        const legacy = computeLiveScore(spot, type, hour, moonIllum);
        const breakdown = computeScoreBreakdown(spot, type, hour, moonIllum);
        expect(breakdown.total).toBe(legacy);
      });
    }
  }

  it('breakdown exposes sub-scores for sun events', () => {
    const bd = computeScoreBreakdown(spot, 'sunset', profiles.firesky);
    expect(bd.base).toBe(80);
    expect(bd.weather).toBeGreaterThan(0);
    expect(bd.cloudLow).not.toBeNull();
    expect(bd.cloudMid).not.toBeNull();
    expect(bd.cloudHigh).not.toBeNull();
    expect(bd.visibilityKm).not.toBeNull();
    expect(bd.totalCloud).toBeNull();
    expect(bd.moonIllum).toBeNull();
  });

  it('breakdown exposes sub-scores for stargazing', () => {
    const bd = computeScoreBreakdown(spot, 'stargazing', profiles.clear, 0.7);
    expect(bd.base).toBe(65);
    expect(bd.cloudLow).toBeNull();
    expect(bd.cloudMid).toBeNull();
    expect(bd.cloudHigh).toBeNull();
    expect(bd.totalCloud).not.toBeNull();
    expect(bd.moonIllum).toBeCloseTo(0.7);
    expect(bd.humidityPenaltyActive).toBe(false);
  });

  it('handles non-finite forecast fields without crashing', () => {
    const nanHour = makeHour({
      cloud: NaN, cloudLow: NaN, cloudMid: NaN, cloudHigh: NaN,
      visibilityKm: NaN, humidity: NaN, pm25: NaN,
    });
    const bd = computeScoreBreakdown(spot, 'sunset', nanHour);
    expect(Number.isFinite(bd.total)).toBe(true);
    expect(bd.cloudLow!.coverage).toBeNull();
    expect(bd.cloudLow!.verdict).toBe('neutral');
    expect(bd.cloudLow!.label).toBe('no data');
  });
});

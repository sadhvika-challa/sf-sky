import { describe, expect, it } from 'vitest';
import SunCalc from 'suncalc';
import { spots } from '../../data/spots';
import { readSkyAtTime, buildSkyWindow, buildPlanningDays, usesSkyExperience, skyWeatherAtTime, findSunsetOpportunity } from '../skyExperience';
import { activeScoreForSpot, canonicalScoresForSpot } from '../../hooks/useTimelineScores';
import { formatCanonicalHourKey } from '../timeline';
import { buildScoreEvidence, formatScoreValue } from '../confidence';
import { mergeOpenMeteoResponses, type HourlyForecast, type SpotForecast } from '../weather';

const spot = spots.find(s => s.id === 'sf-ocean-beach')!;
const noon = new Date('2026-10-18T19:00:00Z');
const sunset = SunCalc.getTimes(noon, spot.lat, spot.lng).sunset;
const clear: HourlyForecast = { cloud: 5, cloudLow: 2, cloudMid: 3, cloudHigh: 4,
  visibilityKm: 20, humidity: 60, tempF: 62, precipProb: 0, windMph: 8,
  gustMph: 12, windDir: 270, pm25: 5, aqi: 20, aerosolOpticalDepth: 0.1 };
function forecast(h = clear): SpotForecast {
  const hours: SpotForecast['hours'] = {};
  for (let offset = -24; offset < 192; offset++) {
    hours[formatCanonicalHourKey(new Date(noon.getTime() + offset * 3_600_000))] = { ...h };
  }
  return { hours, timeZone: 'America/Los_Angeles', fetchedAt: noon.getTime() };
}

describe('SF sky experience', () => {
  it('keeps comfort and curated ratings out of sky quality', () => {
    const expected = readSkyAtTime(spot, clear, noon).score;
    expect(readSkyAtTime(spot, { ...clear, tempF: 40, windMph: 35, gustMph: 50 }, noon).score).toBe(expected);
    expect(readSkyAtTime({ ...spot, sunrise: 0, sunset: 0, elevation: 1000 }, clear, noon).score).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(75);
  });
  it('does not have the 95-percent cloud cliff', () => {
    const sky = { ...clear, cloud: 95, cloudHigh: 95, cloudMid: 50 };
    const a = readSkyAtTime(spot, sky, sunset);
    const b = readSkyAtTime(spot, { ...sky, cloud: 96, cloudHigh: 96 }, sunset);
    expect(Math.abs(a.score! - b.score!)).toBeLessThanOrEqual(2);
    expect(b.score).toBeGreaterThan(60);
    expect(b.scene).toBe('colorful-clouds');
    expect(b.limitations.join(' ')).toContain('Color is not assured');
    // Do not dilute a colorful event with a further hour of unrelated darkness.
    expect(buildSkyWindow(spot, forecast(sky), sunset, 'sunset', noon.getTime()).score).toBeGreaterThanOrEqual(60);
  });
  it('keeps quality continuous across the old sunset-mode boundary', () => {
    const source = forecast();
    const before = new Date(sunset.getTime() - 31 * 60_000);
    const after = new Date(sunset.getTime() - 30 * 60_000);
    const a = activeScoreForSpot(spot, source, formatCanonicalHourKey(before), before, 'now', noon, false);
    const b = activeScoreForSpot(spot, source, formatCanonicalHourKey(after), after, 'sunset', noon, false);
    // Compare the physical instant directly; event windows intentionally have a different scope.
    expect(Math.abs(readSkyAtTime(spot, clear, before).score! - readSkyAtTime(spot, clear, after).score!)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.active - b.active)).toBeLessThanOrEqual(12);
    expect(a.sky).toEqual(buildSkyWindow(spot, source, before, 'now', noon.getTime()));
    expect(b.sky).toEqual(buildSkyWindow(spot, source, after, 'now', noon.getTime()));
    const event = activeScoreForSpot(spot, source, formatCanonicalHourKey(sunset), sunset, 'sunset', noon, false, false, null, true);
    expect(event.sky).toEqual(buildSkyWindow(spot, source, sunset, 'sunset', noon.getTime()));
  });
  it('distinguishes fog at the viewer from unverified above-fog scenery', () => {
    const h = { ...clear, cloud: 95, cloudLow: 95, visibilityKm: 0.5, humidity: 98 };
    const read = readSkyAtTime({ ...spot, elevation: 1000 }, h, noon);
    expect(read.scene).toBe('fog');
    expect(read.score).toBeLessThanOrEqual(25);
    const unknown = readSkyAtTime({ ...spot, elevation: 1000 }, { ...h, visibilityKm: 20 }, noon);
    expect(unknown.scene).not.toBe('fog-scenery');
    expect(unknown.limitations.join(' ')).toContain('height is unavailable');
  });
  it('requires a verified marine layer and height margin for fog scenery', () => {
    const h = { ...clear, cloud: 95, cloudLow: 95, marineCloudBaseMsl: 50,
      marineCloudTopMsl: 150, marineHeightUncertaintyM: 50, marineLayerVerified: true };
    expect(readSkyAtTime({ ...spot, elevation: 300 }, h, noon).scene).toBe('fog-scenery');
    expect(readSkyAtTime({ ...spot, elevation: 180 }, h, noon).scene).not.toBe('fog-scenery');
    expect(readSkyAtTime({ ...spot, elevation: 300 }, { ...h, marineLayerVerified: false }, noon).scene).not.toBe('fog-scenery');
  });
  it('does not replace missing weather with a 95-point place rating', () => {
    const read = activeScoreForSpot(spot, null, formatCanonicalHourKey(sunset), sunset, 'sunset', noon, false);
    expect(read.active).toBeNaN();
    expect(formatScoreValue(read.active)).toBe('--');
    expect(read.activeEvidence.sky?.score).toBeNull();
    expect(canonicalScoresForSpot(spot, null, formatCanonicalHourKey(noon), noon).sunset).toBeNaN();
    expect(canonicalScoresForSpot(spot, null, formatCanonicalHourKey(noon), noon).stargazing).toBeNaN();
  });
  it('makes absent haze a specific limitation while retaining available sky data', () => {
    const source = forecast({ ...clear, pm25: NaN, aerosolOpticalDepth: NaN });
    const sky = buildSkyWindow(spot, source, noon);
    const evidence = buildScoreEvidence({ sky, hourly: source.hours[formatCanonicalHourKey(noon)],
      mode: 'now', moment: 'current', eventTime: noon, now: noon, fetchedAt: noon.getTime() });
    expect(sky.score).toBeGreaterThan(60);
    expect(evidence).toMatchObject({ completeness: 'complete', reason: 'missing-air-quality', confidence: 'medium' });
  });
  it('breaks good viewing duration at missing forecast slices', () => {
    const source = forecast();
    const full = buildSkyWindow(spot, source, new Date(noon.getTime() + 30 * 60_000));
    delete source.hours[formatCanonicalHourKey(new Date(noon.getTime() + 3_600_000))];
    const partial = buildSkyWindow(spot, source, new Date(noon.getTime() + 30 * 60_000));
    expect(full.durationMinutes).toBe(180);
    expect(full.durationCapped).toBe(true);
    expect(partial.coverage).toBe(1);
    expect(partial.score).toBe(full.score);
    expect(partial.durationMinutes).toBe(30);
    expect(partial.stability).toBe('steady');
  });
  it('ends a duration at a malformed hourly boundary without bridging to later good data', () => {
    const source = forecast();
    const bad = formatCanonicalHourKey(new Date(noon.getTime() + 3_600_000));
    source.hours[bad] = { ...clear, cloud: NaN };
    const at = new Date(noon.getTime() + 52 * 60_000);
    const window = buildSkyWindow(spot, source, at);
    expect(window.score).toBeGreaterThan(60);
    expect(window.end).toBe(noon.getTime() + 3_600_000);
    expect(window.durationMinutes).toBe(8);
  });
  it('reduces a poor-visibility sky smoothly and does not count cold wind as obscuration', () => {
    expect(readSkyAtTime(spot, { ...clear, visibilityKm: 1 }, noon).score).toBeLessThan(30);
    expect(readSkyAtTime(spot, { ...clear, visibilityKm: 15 }, noon).score).toBeGreaterThan(70);
  });
  it('offers seven broad planning periods without inventing missing days', () => {
    const days = buildPlanningDays(spot, forecast(), noon, 'America/Los_Angeles');
    expect(days).toHaveLength(7);
    expect(days.every(d => ['Morning', 'Afternoon', 'Evening'].includes(d.period))).toBe(true);
    expect(days.every(d => d.window!.coverage === 1)).toBe(true);
    expect(buildPlanningDays(spot, null, noon, 'America/Los_Angeles')).toEqual([]);
  });
  it('uses ensemble support separately from quality for a distant planning window', () => {
    const source = forecast();
    const later = new Date(noon.getTime() + 72 * 3_600_000);
    const evaluate = () => {
      const sky = buildSkyWindow(spot, source, later, 'now', noon.getTime());
      return buildScoreEvidence({ sky, hourly: clear, mode: 'now', moment: 'selected-hour',
        eventTime: later, now: noon, fetchedAt: noon.getTime() });
    };
    const initial = evaluate();
    expect(initial.confidence).toBe('low');
    source.cloudEnsemble = { fetchedAt: noon.getTime(), model: 'GFS ensemble', hours: {
      [formatCanonicalHourKey(new Date(later.getTime() - 3_600_000))]: Array.from({ length: 31 }, () => ({ cloud: 5, visibility: 20000 })),
      [formatCanonicalHourKey(later)]: Array.from({ length: 31 }, () => ({ cloud: 5, visibility: 20000 })),
    } };
    const supported = evaluate();
    expect(supported.confidence).toBe('medium');
    expect(supported.sky?.score).toBe(initial.sky?.score);
    source.cloudEnsemble.hours[formatCanonicalHourKey(later)].forEach(m => { m.cloud = 95; });
    expect(evaluate().confidence).toBe('low');
  });
  it('uses one short quality scope for hourly and event selections', () => {
    const source = forecast();
    const a = buildSkyWindow(spot, source, sunset, 'now');
    expect(buildSkyWindow(spot, source, sunset, 'sunset')).toEqual(a);
    expect(a.evaluatedEnd! - a.evaluatedStart!).toBe(15 * 60_000);
    const changed = forecast();
    for (const key of Object.keys(changed.hours)) if (Date.parse(key) > sunset.getTime() + 2 * 3_600_000) {
      changed.hours[key] = { ...clear, cloud: 100, cloudLow: 100, visibilityKm: 0.5, humidity: 99 };
    }
    expect(buildSkyWindow(spot, changed, sunset).score).toBe(a.score);
  });
  it('recognizes clear twilight after sunset without claiming restricted visibility', () => {
    const at = new Date(sunset.getTime() + 30 * 60_000);
    const reading = readSkyAtTime(spot, clear, at);
    expect(reading.scene).toBe('blue-twilight');
    expect(reading.score).toBeGreaterThanOrEqual(60);
    expect(reading.label).not.toContain('Limited');
    const blocked = readSkyAtTime(spot, { ...clear, cloud: 100, cloudLow: 100, visibilityKm: 0.5, humidity: 99 }, at);
    expect(blocked.scene).toBe('fog');
    expect(blocked.score).toBeLessThan(25);
  });
  it('gives illuminated cloud afterglow its own scene before blue twilight', () => {
    const at = new Date(sunset.getTime() + 15 * 60_000);
    const reading = readSkyAtTime(spot, { ...clear, cloud: 75, cloudMid: 40, cloudHigh: 75 }, at);
    expect(reading.scene).toBe('afterglow');
    expect(reading.score).toBeGreaterThanOrEqual(60);
    expect(reading.limitations.join(' ')).toContain('not assured');
  });
  it('interpolates adjacent weather without filling absent hours or missing haze', () => {
    const source = forecast();
    const hour = formatCanonicalHourKey(noon);
    const next = formatCanonicalHourKey(new Date(noon.getTime() + 3_600_000));
    source.hours[next] = { ...clear, cloud: 95, pm25: NaN };
    expect(skyWeatherAtTime(source, new Date(noon.getTime() + 30 * 60_000))!.cloud).toBe(50);
    delete source.hours[hour];
    expect(skyWeatherAtTime(source, new Date(noon.getTime() + 30 * 60_000))).toBeNull();
    const absent = forecast({ ...clear, pm25: NaN, aerosolOpticalDepth: NaN });
    expect(skyWeatherAtTime(absent, noon)!.pm25).toBeNaN();
  });
  it('does not let a low star score describe an unobstructed night as overcast', () => {
    const at = new Date(sunset.getTime() + 4 * 3_600_000);
    const read = readSkyAtTime({ ...spot, lightPollution: 'High' }, { ...clear, cloud: 65, cloudLow: 10, cloudHigh: 65 }, at);
    expect(read.score).toBeLessThan(40);
    expect(read.scene).toBe('stargazing');
    expect(read.label).toBe('Night sky');
  });
  it('finds an approximate sunset opportunity without promising a good period in fog', () => {
    const source = forecast();
    const plan = findSunsetOpportunity(spot, source, sunset, noon.getTime())!;
    expect(plan.peakAt).toBeGreaterThanOrEqual(sunset.getTime() - 3_600_000);
    expect(plan.peakAt).toBeLessThan(sunset.getTime() + 90 * 60_000);
    expect(plan.window.score).toBeGreaterThanOrEqual(60);
    expect(plan.start).toBeLessThanOrEqual(plan.peakAt);
    const fog = findSunsetOpportunity(spot, forecast({ ...clear, cloud: 100, cloudLow: 100, visibilityKm: 0.5, humidity: 99 }), sunset, noon.getTime())!;
    expect(fog.window.score).toBeLessThan(25);
    expect(fog.window.durationMinutes).toBe(0);
    expect(findSunsetOpportunity(spot, null, sunset)).toBeNull();
  });
  it('preserves other cities outside the SF pilot', () => {
    expect(usesSkyExperience({ ...spot, city: 'austin' })).toBe(false);
    expect(usesSkyExperience(spot)).toBe(true);
  });
  it('ingests optional signals and preserves absent optical depth', () => {
    const time = Math.floor(noon.getTime() / 1000);
    const result = mergeOpenMeteoResponses({ latitude: 37.77, longitude: -122.48, elevation: 6,
      hourly: { time: [time], cloud_cover: [10], dew_point_2m: [52], pressure_msl: [1015],
        shortwave_radiation: [500], sunshine_duration: [3000], direct_normal_irradiance: [600] } }, null, 'America/Los_Angeles');
    expect(result.grid?.elevation).toBe(6);
    expect(result.hours[formatCanonicalHourKey(noon)]).toMatchObject({ dewPointF: 52, pressureMsl: 1015, shortwaveRadiation: 500 });
    expect(result.hours[formatCanonicalHourKey(noon)].aerosolOpticalDepth).toBeNaN();
  });
});

import { formatCanonicalHourKey } from './timeline';
import type { HourlyForecast } from './weather';

export interface CloudMember {
  cloud: number;
  visibility: number;
}
export interface CloudEnsemble {
  fetchedAt: number;
  model: 'GFS ensemble';
  hours: Record<string, CloudMember[]>;
}
export interface CloudAgreement {
  agreement: 'agree' | 'mixed' | 'unavailable';
  members: number;
}

const cache = new Map<string, CloudEnsemble>();
// The live GFS endpoint returns null cloud-layer fields. Use only verified
// populated fields; total-cloud agreement does not establish fog placement.
const FIELDS = ['cloud_cover', 'visibility'] as const;

export function parseCloudEnsemble(data: { hourly?: Record<string, Array<number | null>> }, fetchedAt: number): CloudEnsemble {
  const hours: CloudEnsemble['hours'] = {};
  const hourly = data.hourly ?? {};
  const members = Object.keys(hourly).filter(key => /^cloud_cover(?:_member\d+)?$/.test(key))
    .map(key => key.slice('cloud_cover'.length));
  for (const [i, epoch] of (hourly.time ?? []).entries()) {
    if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch % 3600 !== 0) continue;
    const readings: CloudMember[] = [];
    for (const suffix of members) {
      const values = FIELDS.map(field => hourly[`${field}${suffix}`]?.[i]);
      if (values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) ||
          values[0]! > 100) continue;
      const [cloud, visibility] = values as number[];
      readings.push({ cloud, visibility });
    }
    if (readings.length >= 20) hours[formatCanonicalHourKey(new Date(epoch * 1000))] = readings;
  }
  return { model: 'GFS ensemble', fetchedAt, hours };
}

/** Broad cloud/visibility agreement only, never a probability of a pretty sky.
 * Each hour must have support. A missing hour cannot be bridged by an average.
 */
export function cloudAgreement(ensemble: CloudEnsemble | undefined, start: number, end: number, nowMs: number, reference?: Record<string, HourlyForecast>): CloudAgreement {
  if (!ensemble || nowMs - ensemble.fetchedAt > 2 * 3_600_000 || ensemble.fetchedAt > nowMs + 60_000) return { agreement: 'unavailable', members: 0 };
  let minimumMembers = Infinity;
  let mixed = false;
  for (let at = Math.floor(start / 3_600_000) * 3_600_000; at < end; at += 3_600_000) {
    const members = ensemble.hours[formatCanonicalHourKey(new Date(at))];
    if (!members || members.length < 20) return { agreement: 'unavailable', members: 0 };
    minimumMembers = Math.min(minimumMembers, members.length);
    for (const field of ['cloud', 'visibility'] as const) {
      const values = members.map(m => m[field]).sort((a, b) => a - b);
      const spread = values[Math.floor((values.length - 1) * 0.9)] - values[Math.floor((values.length - 1) * 0.1)];
      // Empirical agreement bands, retained separately from sky quality.
      if (spread > (field === 'visibility' ? 10_000 : 30)) mixed = true;
      const reading = reference?.[formatCanonicalHourKey(new Date(at))];
      if (reading) {
        const expected = field === 'visibility' ? reading.visibilityKm * 1000 : reading.cloud;
        if (!Number.isFinite(expected) || Math.abs(values[Math.floor(values.length / 2)] - expected) >
          (field === 'visibility' ? 10_000 : 30)) mixed = true;
      } else if (reference) return { agreement: 'unavailable', members: 0 };
    }
  }
  return Number.isFinite(minimumMembers) ? { agreement: mixed ? 'mixed' : 'agree', members: minimumMembers } : { agreement: 'unavailable', members: 0 };
}

/** One optional request per planning coordinate per hour. Forecast and AQ
 * remain usable if this endpoint is unavailable. No private exact coordinates.
 */
export async function fetchCloudEnsemble(lat: number, lng: number, timeZone: string, signal: AbortSignal): Promise<CloudEnsemble | null> {
  const key = `${lat.toFixed(4)}:${lng.toFixed(4)}:${timeZone}`;
  const previous = cache.get(key);
  if (previous && Date.now() - previous.fetchedAt < 3_600_000) return previous;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) return null;
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const params = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
      hourly: FIELDS.join(','), models: 'gfs_seamless', forecast_days: '8',
      timezone: timeZone, timeformat: 'unixtime' });
    const response = await fetch(`https://ensemble-api.open-meteo.com/v1/ensemble?${params}`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (controller.signal.aborted) return null;
    const result = parseCloudEnsemble(data, Date.now());
    if (Object.keys(result.hours).length === 0) return null;
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  } catch { return null; }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}

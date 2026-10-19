import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudAgreement, fetchCloudEnsemble, parseCloudEnsemble } from '../skyEnsemble';
import { formatCanonicalHourKey } from '../timeline';
import type { HourlyForecast } from '../weather';

const at = Date.UTC(2026, 9, 18, 19);
const hour = 3_600_000;
function response(count = 31) {
  const hourly: Record<string, Array<number | null>> = { time: [at / 1000, at / 1000 + 3600] };
  for (let member = 0; member < count; member++) {
    const suffix = member === 0 ? '' : `_member${String(member).padStart(2, '0')}`;
    for (const field of ['cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility']) {
      hourly[field + suffix] = field === 'visibility' ? [20000, 20000] : [10, 10];
    }
  }
  return { hourly };
}
afterEach(() => vi.unstubAllGlobals());
describe('ensemble support for sky planning', () => {
  it('requires complete members and enough members for every hour', () => {
    const data = response();
    data.hourly.visibility_member01[0] = null;
    data.hourly.cloud_cover_member02[0] = 101;
    const ensemble = parseCloudEnsemble(data, at);
    expect(ensemble.hours[formatCanonicalHourKey(new Date(at))]).toHaveLength(29);
    expect(cloudAgreement(ensemble, at, at + hour, at)).toEqual({ agreement: 'agree', members: 29 });
    expect(Object.keys(parseCloudEnsemble(response(19), at).hours)).toHaveLength(0);
  });
  it('never bridges a missing hour or uses stale or future retrievals', () => {
    const ensemble = parseCloudEnsemble(response(), at);
    expect(cloudAgreement(ensemble, at, at + 3 * hour, at).agreement).toBe('unavailable');
    expect(cloudAgreement(ensemble, at, at + hour, at + 3 * hour).agreement).toBe('unavailable');
    expect(cloudAgreement({ ...ensemble, fetchedAt: at + hour }, at, at + hour, at).agreement).toBe('unavailable');
  });
  it('distinguishes agreement from spread and disagreement with the displayed forecast', () => {
    const data = response();
    for (let member = 16; member < 31; member++) data.hourly[`cloud_cover_member${member}`] = [90, 90];
    expect(cloudAgreement(parseCloudEnsemble(data, at), at, at + hour, at).agreement).toBe('mixed');
    const reference = { [formatCanonicalHourKey(new Date(at))]: {
      cloud: 95, cloudLow: 95, cloudMid: 95, cloudHigh: 95, visibilityKm: 20,
    } as HourlyForecast };
    expect(cloudAgreement(parseCloudEnsemble(response(), at), at, at + hour, at, reference).agreement).toBe('mixed');
  });
  it('does not turn an ensemble outage into a weather outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchCloudEnsemble(37.76, -122.51, 'America/Los_Angeles', new AbortController().signal)).toBeNull();
    const controller = new AbortController();
    controller.abort();
    expect(await fetchCloudEnsemble(37.76, -122.51, 'America/Los_Angeles', controller.signal)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

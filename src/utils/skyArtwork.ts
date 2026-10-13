import SunCalc from 'suncalc';
import type { HourlyForecast } from './weather';

/** Illustrative light and cloud cover, never a camera view or a score proxy. */
export function getSkyArtwork(
  latitude: number,
  longitude: number,
  instant: Date,
  forecast: HourlyForecast | null,
) {
  const altitude = SunCalc.getPosition(instant, latitude, longitude).altitude;
  const night = altitude < -0.1;
  const golden = !night && altitude < 0.18;
  const cloudy = forecast !== null && (
    forecast.cloud >= 75 || forecast.cloudLow >= 70 || forecast.visibilityKm < 2
  );
  const sparseCloud = forecast !== null && Number.isFinite(forecast.cloud) && forecast.cloud <= 20
    && [forecast.cloudLow, forecast.cloudMid, forecast.cloudHigh].every((cover) => !Number.isFinite(cover) || cover <= 20);
  const kind = cloudy ? (night ? 'night-overcast' : golden ? 'golden-overcast' : 'overcast')
    : night ? 'night' : golden ? (sparseCloud ? 'golden-clear' : 'golden') : 'day';
  const light = night ? 'night' : golden ? 'golden-hour' : 'daytime';
  return {
    src: `/sky/${kind}.webp`,
    label: `Illustrative ${cloudy ? 'cloudy ' : ''}${light} sky${forecast ? '' : ', forecast conditions unavailable'}`,
  };
}

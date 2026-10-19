import SunCalc from 'suncalc';
import type { HourlyForecast } from './weather';
import type { SkyScene } from './skyExperience';

/** Illustrative light and cloud cover, never a camera view or a score proxy. */
export function getSkyArtwork(
  latitude: number,
  longitude: number,
  instant: Date,
  forecast: HourlyForecast | null,
  scene?: SkyScene,
) {
  const altitude = SunCalc.getPosition(instant, latitude, longitude).altitude;
  const twilight = scene === 'blue-twilight' || scene === 'afterglow';
  const night = altitude < -0.1;
  const golden = !night && altitude < 0.18;
  const cloudy = forecast !== null && (
    forecast.cloud >= 75 || forecast.cloudLow >= 70 || forecast.visibilityKm < 2
  );
  const sparseCloud = forecast !== null && Number.isFinite(forecast.cloud) && forecast.cloud <= 20
    && [forecast.cloudLow, forecast.cloudMid, forecast.cloudHigh].every((cover) => !Number.isFinite(cover) || cover <= 20);
  const kind = twilight ? 'twilight' : scene === 'colorful-clouds' ? 'golden'
    : cloudy ? (night ? 'night-overcast' : golden ? 'golden-overcast' : 'overcast')
    : night ? 'night' : golden ? (sparseCloud ? 'golden-clear' : 'golden') : 'day';
  const light = twilight ? 'twilight' : night ? 'night' : golden ? 'golden-hour' : 'daytime';
  return {
    src: `/sky/${kind}.${twilight ? 'png' : 'webp'}`,
    label: `Illustrative ${cloudy ? 'cloudy ' : ''}${light} sky${forecast ? '' : ', forecast conditions unavailable'}`,
  };
}

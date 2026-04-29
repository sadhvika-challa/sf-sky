import { useMemo } from 'react';
import { type SpotForecast } from '../utils/weather';
import { type WeatherMetric } from '../utils/interpolate';
import { buildSamples, buildWindDirs } from '../utils/weatherSamples';
import { longFormFor } from '../utils/narrative';
import TempExpanded from './weatherSheet/TempExpanded';
import CloudsExpanded from './weatherSheet/CloudsExpanded';
import PrecipExpanded from './weatherSheet/PrecipExpanded';
import WindExpanded from './weatherSheet/WindExpanded';
import FogExpanded from './weatherSheet/FogExpanded';

interface WeatherSheetExpandedProps {
  metric: WeatherMetric;
  hourKey: string;
  hourKeys: string[];
  forecasts: Map<number, SpotForecast>;
  onHourChange: (key: string) => void;
}

/**
 * Pulled-up bottom-sheet content. Each weather metric has its own
 * bespoke layout so the sheet leads with the story that actually
 * matters for that layer (peak time for temp, clearest window for
 * clouds, Karl's transect for fog, etc.). This component only routes;
 * the per-metric files under `weatherSheet/` own their own data
 * shaping and rendering.
 */
export default function WeatherSheetExpanded({
  metric,
  hourKey,
  hourKeys,
  forecasts,
}: WeatherSheetExpandedProps) {
  // Karl's longer-form narrative is shared across every layout's quote
  // card, so we compute it once at the router and pass it down rather
  // than have each sheet re-derive it.
  const longForm = useMemo(() => {
    if (!hourKey || forecasts.size === 0) return '';
    const samples = buildSamples(metric, hourKey, forecasts);
    if (samples.size === 0) return '';
    const prevIdx = hourKeys.indexOf(hourKey) - 1;
    const prev =
      prevIdx >= 0 ? buildSamples(metric, hourKeys[prevIdx], forecasts) : null;
    const windDirs = metric === 'wind' ? buildWindDirs(hourKey, forecasts) : undefined;
    return longFormFor(metric, samples, prev, windDirs);
  }, [metric, hourKey, hourKeys, forecasts]);

  switch (metric) {
    case 'temp':
      return (
        <TempExpanded
          hourKey={hourKey}
          hourKeys={hourKeys}
          forecasts={forecasts}
          longForm={longForm}
        />
      );
    case 'clouds':
      return (
        <CloudsExpanded
          hourKey={hourKey}
          hourKeys={hourKeys}
          forecasts={forecasts}
          longForm={longForm}
        />
      );
    case 'precip':
      return (
        <PrecipExpanded
          hourKey={hourKey}
          hourKeys={hourKeys}
          forecasts={forecasts}
          longForm={longForm}
        />
      );
    case 'wind':
      return (
        <WindExpanded
          hourKey={hourKey}
          hourKeys={hourKeys}
          forecasts={forecasts}
          longForm={longForm}
        />
      );
    case 'fog':
      return (
        <FogExpanded
          hourKey={hourKey}
          hourKeys={hourKeys}
          forecasts={forecasts}
          longForm={longForm}
        />
      );
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${String(_exhaustive)}`);
    }
  }
}

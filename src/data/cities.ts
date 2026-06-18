import type { City } from './spots';

export interface CityConfig {
  id: City;
  name: string;
  short: string;
  emoji: string;
  tagline: string;
  hasWeatherMode: boolean;
  center: [number, number];
  defaultZoom: number;
  bounds: [[number, number], [number, number]];
}

export const CITIES: CityConfig[] = [
  {
    id: 'sf',
    name: 'San Francisco',
    short: 'SF',
    emoji: '🌁',
    tagline: 'Fog clears, golden light stays',
    hasWeatherMode: true,
    center: [37.7649, -122.4494],
    defaultZoom: 12.5,
    bounds: [[37.60, -122.60], [37.90, -122.30]],
  },
  {
    id: 'santa-cruz',
    name: 'Santa Cruz',
    short: 'SC',
    emoji: '🏄',
    tagline: 'Coastal fog clearing by dusk',
    hasWeatherMode: false,
    center: [36.974, -122.030],
    defaultZoom: 12,
    bounds: [[36.90, -122.10], [37.05, -121.95]],
  },
  {
    id: 'austin',
    name: 'Austin',
    short: 'ATX',
    emoji: '🤠',
    tagline: 'Wide open Hill Country skies',
    hasWeatherMode: false,
    center: [30.30, -97.78],
    defaultZoom: 11,
    bounds: [[30.10, -98.05], [30.55, -97.55]],
  },
];

export const DEFAULT_CITY_ID: City = 'sf';

export function getCityById(id: string): CityConfig | undefined {
  return CITIES.find((c) => c.id === id);
}

export function getValidCityId(id: string | null | undefined): City {
  if (id && CITIES.some((c) => c.id === id)) return id as City;
  return DEFAULT_CITY_ID;
}

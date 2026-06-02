import type { Filters } from '../App';

export const DISMISS_HIGHLIGHT_MS = 1600;
export const APP_MODE_STORAGE_KEY = 'sf-sky:appMode';
export const HOME_CITY_KEY = 'sky:homeCity';
export const ACTIVE_CITY_KEY = 'sky:activeCity';

export const defaultFilters: Filters = {
  sunrise: [],
  sunset: [],
  stargazing: [],
};

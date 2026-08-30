import { useState } from 'react';
import type { LocationState } from '../hooks/useLocation';
import type { OpenAppSettingsResult } from '../platform/appSettings';

interface LocationControlProps {
  state: LocationState;
  onRequest: () => void | Promise<LocationState>;
  onChooseCity: () => void;
  onUseCityInstead: () => void;
  canOpenLocationSettings?: boolean;
  onOpenLocationSettings?: () => Promise<OpenAppSettingsResult>;
}

interface LocationControlContent {
  message: string;
  action: 'Use my location' | 'Retry' | 'Finding…' | null;
}

function getLocationControlContent(state: LocationState): LocationControlContent {
  switch (state.status) {
    case 'not-requested':
      return {
        message: 'See the best sky-viewing spots near you right now. Your coordinates are never saved.',
        action: 'Use my location',
      };
    case 'requesting':
      return { message: 'Finding your location…', action: 'Finding…' };
    case 'allowed':
      if (state.location.precision === 'approximate') {
        return {
          message: 'Using approximate location. Distances are approximate.',
          action: 'Retry',
        };
      }
      if (state.location.precision === 'precise') {
        return {
          message: 'Using your precise location. Nearby distances are ready.',
          action: null,
        };
      }
      return {
        message: 'Using your location. Nearby distances are ready.',
        action: null,
      };
    case 'denied':
      return {
        message: 'Location access was denied. Allow it in device settings, then retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'timeout':
      return {
        message: 'Location timed out. Retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'unavailable':
      return {
        message: 'Location is unavailable right now. Retry, or keep browsing by city.',
        action: 'Retry',
      };
    case 'unsupported':
      return {
        message: 'This browser does not support location. Keep browsing by city.',
        action: null,
      };
  }
}

export default function LocationControl({
  state,
  onRequest,
  onChooseCity,
  onUseCityInstead,
  canOpenLocationSettings = false,
  onOpenLocationSettings,
}: LocationControlProps) {
  const content = getLocationControlContent(state);
  const pending = state.status === 'requesting';
  const showChooseCity = state.status !== 'allowed' && state.status !== 'requesting';
  const showSettingsRecovery = state.status === 'denied' &&
    canOpenLocationSettings &&
    Boolean(onOpenLocationSettings);
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'opening' | 'opened' | 'failed'>('idle');

  const openLocationSettings = async () => {
    if (!onOpenLocationSettings || settingsStatus === 'opening') return;
    setSettingsStatus('opening');
    const result = await onOpenLocationSettings();
    setSettingsStatus(result.status === 'opened' ? 'opened' : 'failed');
  };

  const requestLocation = () => {
    setSettingsStatus('idle');
    void onRequest();
  };

  const locationMessage = showSettingsRecovery
    ? settingsStatus === 'opened'
      ? 'Soleil opened Settings. Retry to check your current location access, or keep browsing by city.'
      : 'Location was denied on the last attempt. Open Settings to allow it, then return and retry, or keep browsing by city.'
    : content.message;

  return (
    <section
      aria-label="Location preferences"
      className="mb-2 border-b border-cream-dark/70 pb-2"
    >
      <div className="flex min-h-11 items-center gap-3">
        <p
          className="min-w-0 flex-1 font-sans text-[12px] leading-snug text-gray-600"
          role="status"
          aria-live="polite"
        >
          {locationMessage}
        </p>
        {showSettingsRecovery ? (
          <button
            type="button"
            onClick={() => void openLocationSettings()}
            disabled={settingsStatus === 'opening'}
            className="min-h-11 flex-shrink-0 rounded-full bg-gray-800 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:cursor-wait disabled:opacity-60"
          >
            {settingsStatus === 'opening' ? 'Opening…' : 'Open Settings'}
          </button>
        ) : content.action && (
          <button
            type="button"
            onClick={requestLocation}
            disabled={pending}
            className="min-h-11 flex-shrink-0 rounded-full bg-gray-800 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800 disabled:cursor-wait disabled:opacity-60"
          >
            {content.action}
          </button>
        )}
      </div>
      {showSettingsRecovery && (
        <div className="flex flex-wrap items-center gap-x-3">
          <button
            type="button"
            onClick={requestLocation}
            className="min-h-11 rounded-md px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
          >
            Retry location
          </button>
          {settingsStatus === 'opened' && (
            <p className="text-[11px] leading-snug text-gray-600" role="status" aria-live="polite">
              Retry checks your current location access.
            </p>
          )}
          {settingsStatus === 'failed' && (
            <p className="text-[11px] leading-snug text-red-700" role="alert">
              Settings could not be opened. Open the Settings app, find Soleil, and allow location, or browse by city.
            </p>
          )}
        </div>
      )}
      {showChooseCity && (
        <button
          type="button"
          onClick={onChooseCity}
          className="min-h-11 rounded-md px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
        >
          Choose a city
        </button>
      )}
      {state.status === 'allowed' && (
        <button
          type="button"
          onClick={onUseCityInstead}
          className="min-h-11 rounded-md px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 underline decoration-gray-400 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700"
        >
          Use city instead
        </button>
      )}
    </section>
  );
}

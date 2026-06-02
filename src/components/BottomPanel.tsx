import { useCallback, useEffect, useRef } from 'react';
import type { WeatherMetric } from '../utils/interpolate';
import type { NeighborhoodForecasts } from '../hooks/useNeighborhoodForecasts';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';
import WeatherControls from './WeatherControls';
import WeatherSheetExpanded from './WeatherSheetExpanded';

interface BottomPanelProps {
  weatherMetric: WeatherMetric;
  weatherHourKeys: string[];
  weatherHourKey: string;
  onWeatherHourChange: (key: string) => void;
  weatherNowIndex: number;
  weatherForecasts: NeighborhoodForecasts;
  weatherSheetExpanded: boolean;
  onWeatherSheetExpandedChange: (expanded: boolean) => void;
}

/**
 * Weather-mode bottom sheet. The pill handle only appears when the sheet
 * is expanded (so swipe-down can collapse it); in the compact state we
 * show a chevron-up affordance instead so users never see a drag handle
 * for a gesture that does nothing.
 */
function BottomPanel({
  weatherMetric,
  weatherHourKeys,
  weatherHourKey,
  onWeatherHourChange,
  weatherNowIndex,
  weatherForecasts,
  weatherSheetExpanded,
  onWeatherSheetExpandedChange,
}: BottomPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const canSwipeDown = weatherSheetExpanded;

  const handleDismiss = useCallback(() => {
    onWeatherSheetExpandedChange(false);
  }, [onWeatherSheetExpandedChange]);

  const { dragY, isDragging, suppressClickRef, handlers, reset } = useSwipeDismiss({
    onDismiss: handleDismiss,
    enabled: canSwipeDown,
    distanceThreshold: 80,
  });

  // If the parent collapses the sheet (e.g. mode switch), make sure any
  // in-flight drag transform clears so the panel doesn't snap back from a
  // stale offset on the next interaction.
  useEffect(() => {
    if (!canSwipeDown) reset();
  }, [canSwipeDown, reset]);

  const handlePillClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (weatherSheetExpanded) {
      onWeatherSheetExpandedChange(false);
    }
  };

  const showPill = canSwipeDown;
  const showExpandChevron = !weatherSheetExpanded;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30">
      {/* Panel chrome bleeds all the way to the screen bottom (safe area
          absorbed as inner padding) so the cream never lifts off the
          edge — otherwise the body's water-blue bg shows as a strip
          below the panel on devices with a home indicator. */}
      <div
        ref={panelRef}
        className="mx-auto w-[min(560px,100%)] rounded-t-3xl bg-[rgba(250,250,248,0.97)] backdrop-blur-md border-t border-x border-white/60 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: isDragging ? 'transform' : undefined,
        }}
      >
        {showPill ? (
          <button
            type="button"
            onClick={handlePillClick}
            onPointerDown={handlers.onPointerDown}
            onPointerMove={handlers.onPointerMove}
            onPointerUp={handlers.onPointerUp}
            onPointerCancel={handlers.onPointerCancel}
            className="w-full flex justify-center pt-2 pb-1 group touch-none"
            style={{ touchAction: 'none' }}
            aria-label="Swipe down to collapse weather details"
            aria-expanded={weatherSheetExpanded}
          >
            <span className="block w-9 h-1 rounded-full bg-gray-300 group-hover:bg-gray-400 transition-colors" />
          </button>
        ) : showExpandChevron ? (
          <button
            type="button"
            onClick={() => onWeatherSheetExpandedChange(true)}
            className="w-full flex justify-center pt-1.5 pb-0.5 group"
            aria-label="Expand weather details"
            aria-expanded={false}
          >
            <svg
              width="18"
              height="10"
              viewBox="0 0 18 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-gray-400 group-hover:text-gray-600 transition-colors"
            >
              <path d="M2 7l7-5 7 5" />
            </svg>
          </button>
        ) : (
          <div className="h-2.5" aria-hidden="true" />
        )}

        <div className="px-3 pb-3">
          <WeatherControls
            hourKeys={weatherHourKeys}
            hourKey={weatherHourKey}
            onHourChange={onWeatherHourChange}
            nowIndex={weatherNowIndex}
          />
        </div>

        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-t border-black/5"
          style={{
            maxHeight: weatherSheetExpanded ? '540px' : '0px',
          }}
          aria-hidden={!weatherSheetExpanded}
        >
          <WeatherSheetExpanded
            metric={weatherMetric}
            hourKey={weatherHourKey}
            hourKeys={weatherHourKeys}
            forecasts={weatherForecasts}
            onHourChange={onWeatherHourChange}
          />
        </div>
      </div>
    </div>
  );
}

export default BottomPanel;

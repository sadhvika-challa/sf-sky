import { useEffect, useMemo, useState } from 'react';
import type { Spot } from '../data/spots';
import type { SavedSpotsError, SavedSpotsState } from '../hooks/useSavedSpots';
import { groupSavedSpots } from './savedSpotsViewModel';

interface SavedSpotsSheetProps {
  open: boolean;
  onClose: () => void;
  spots: readonly Spot[];
  savedSpotIds: readonly string[];
  status: SavedSpotsState['status'];
  error: SavedSpotsError | null;
  onSelectSpot: (spot: Spot) => void;
  onUnsave: (spotId: string) => Promise<boolean>;
  onRetry: () => Promise<void>;
}

function errorMessage(error: SavedSpotsError | null): string | null {
  if (error === 'read-failed') {
    return 'Saved spots could not be read. You can keep browsing every city and try again.';
  }
  if (error === 'write-failed') {
    return 'The last change was not saved on this device. Your durable saved list is shown below.';
  }
  if (error === 'future-version') {
    return 'This saved list was created by a newer version of Soleil. It is protected from changes here.';
  }
  return null;
}

interface SavedSpotRowProps {
  spot: Spot;
  onSelect: () => void;
  onUnsave: () => Promise<boolean>;
}

function SavedSpotRow({ spot, onSelect, onUnsave }: SavedSpotRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRemove = async () => {
    setPending(true);
    setFeedback(null);
    const succeeded = await onUnsave();
    setPending(false);
    if (!succeeded) {
      setConfirming(false);
      setFeedback(`${spot.name} was not removed. Try again.`);
    }
  };

  return (
    <div className="border-b border-cream-dark last:border-b-0">
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={onSelect}
          className="min-h-11 flex-1 min-w-0 px-3 py-2 text-left rounded-lg active:bg-cream-dark/40 transition-colors"
          aria-label={`Open ${spot.name}`}
        >
          <span className="block font-serif text-base font-medium text-gray-800 truncate">
            {spot.name}
          </span>
          <span className="block mt-0.5 font-mono text-[10px] tracking-[1px] uppercase text-gray-400">
            {spot.category.replace('-', ' ')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setFeedback(null);
          }}
          disabled={pending}
          className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-gray-400 active:bg-cream-dark/50 disabled:opacity-50"
          aria-label={`Remove ${spot.name} from saved spots`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        </button>
      </div>

      {confirming && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" role="group" aria-label={`Confirm removing ${spot.name}`}>
          <p className="font-mono text-[11px] text-gray-700">Remove {spot.name} from saved spots?</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="min-h-11 px-3 font-mono text-[11px] text-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={pending}
              className="min-h-11 px-3 rounded-lg bg-gray-800 font-mono text-[11px] text-cream disabled:opacity-50"
            >
              {pending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p className="mx-3 mb-3 font-mono text-[11px] text-red-700" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
    </div>
  );
}

export default function SavedSpotsSheet({
  open,
  onClose,
  spots,
  savedSpotIds,
  status,
  error,
  onSelectSpot,
  onUnsave,
  onRetry,
}: SavedSpotsSheetProps) {
  const [retrying, setRetrying] = useState(false);
  const [pendingRemovalSpots, setPendingRemovalSpots] = useState<ReadonlyMap<string, Spot>>(
    () => new Map(),
  );
  const visibleSavedSpotIds = useMemo(() => {
    const ids = new Set(savedSpotIds);
    for (const spotId of pendingRemovalSpots.keys()) ids.add(spotId);
    return [...ids];
  }, [pendingRemovalSpots, savedSpotIds]);
  const groups = useMemo(
    () => groupSavedSpots(spots, visibleSavedSpotIds),
    [spots, visibleSavedSpotIds],
  );
  const message = errorMessage(error);
  const canRetry = status === 'error';

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  const handleUnsave = async (spot: Spot): Promise<boolean> => {
    setPendingRemovalSpots((current) => {
      const next = new Map(current);
      next.set(spot.id, spot);
      return next;
    });
    const succeeded = await onUnsave(spot.id);
    setPendingRemovalSpots((current) => {
      const next = new Map(current);
      next.delete(spot.id);
      return next;
    });
    return succeeded;
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[910]">
      <div onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-spots-title"
        className="absolute bottom-0 left-0 right-0 mx-auto w-[min(480px,100%)] max-h-[82dvh] rounded-t-[18px] bg-cream shadow-2xl border-t border-cream-dark flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2" aria-hidden="true">
          <span className="block w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pt-2 pb-3 border-b border-cream-dark">
          <div>
            <h2 id="saved-spots-title" className="font-serif text-xl font-semibold text-gray-800">
              Saved spots
            </h2>
            <p className="mt-1 font-mono text-[10px] leading-4 text-gray-500">
              Saves stay on this device. They do not sync to other devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="w-11 h-11 -mt-1 -mr-2 rounded-full flex items-center justify-center text-gray-500 active:bg-cream-dark/50"
            aria-label="Close saved spots"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {status === 'loading' && (
            <p className="py-10 text-center font-mono text-[11px] text-gray-500" role="status">
              Loading saved spots…
            </p>
          )}

          {message && status !== 'loading' && (
            <div className={`mb-3 rounded-lg border px-3 py-3 ${
              status === 'protected'
                ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
            }`} role="status">
              <p className="font-mono text-[11px] leading-4 text-gray-700">{message}</p>
              {canRetry && (
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={retrying}
                  className="mt-2 min-h-11 px-3 rounded-lg border border-gray-300 font-mono text-[11px] text-gray-700 active:bg-white/70 disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              )}
            </div>
          )}

          {status !== 'loading' && groups.length === 0 && status !== 'protected' && error !== 'read-failed' && (
            <div className="py-10 text-center">
              <p className="font-serif text-lg text-gray-700">No saved spots yet</p>
              <p className="mt-2 font-mono text-[11px] leading-4 text-gray-500">
                Open any spot and use its save button. The full city catalog remains available offline.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.cityId} className="mb-5 last:mb-0" aria-labelledby={`saved-city-${group.cityId}`}>
              <h3 id={`saved-city-${group.cityId}`} className="px-3 mb-1 font-mono text-[10px] tracking-[1.5px] uppercase text-gray-500">
                {group.cityName}
              </h3>
              <div className="rounded-xl border border-cream-dark bg-white/30">
                {group.spots.map((spot) => (
                  <SavedSpotRow
                    key={spot.id}
                    spot={spot}
                    onSelect={() => onSelectSpot(spot)}
                    onUnsave={() => handleUnsave(spot)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

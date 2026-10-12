import { useEffect, useState } from 'react';
import { savedSpotsKeyValueStore as store } from '../platform/savedSpotsStorage';
import { addPrivateSpots, isPrivateSpot, parsePrivateSpots, PRIVATE_SPOTS_STORAGE_KEY, type PrivateSpot } from '../utils/privateSpots';
import { updateSavedSpot } from '../utils/savedSpots';
import { KNOWN_SPOT_IDS } from '../data/spotIdentity';

export function usePrivateSpots() {
  const [spots, setSpots] = useState<PrivateSpot[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let loaded = parsePrivateSpots(await store.get(PRIVATE_SPOTS_STORAGE_KEY));
        // Local development can provision this device without putting personal
        // addresses in source control or a production bundle.
        if (import.meta.env.DEV) {
          const response = await fetch('/__soleil/private-spots');
          if (response.status === 200) {
            const seeds: unknown = await response.json();
            if (!Array.isArray(seeds) || !seeds.every(isPrivateSpot)) throw new Error('Invalid local private spots.');
            const newSpots = seeds.filter((seed) => !loaded.some((spot) => spot.id === seed.id));
            if (newSpots.length > 0) {
              loaded = await addPrivateSpots(store, newSpots);
              const knownIds = new Set([...KNOWN_SPOT_IDS, ...loaded.map((spot) => spot.id)]);
              for (const spot of newSpots) await updateSavedSpot(store, spot.id, true, knownIds);
            }
          }
        }
        if (!cancelled) { setSpots((current) => JSON.stringify(current) === JSON.stringify(loaded) ? current : loaded); setError(null); }
      } catch {
        if (!cancelled) setError('Private spots could not be loaded. Stored data was preserved.');
      }
    };
    void load();
    const unsubscribe = store.subscribe?.(PRIVATE_SPOTS_STORAGE_KEY, () => { void load(); });
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);
  return { spots, error };
}

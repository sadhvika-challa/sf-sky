import { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';
import Supercluster, { type AnyProps, type ClusterFeature, type PointFeature } from 'supercluster';

/**
 * Bounds-aware clustering powered by `supercluster`. Returns the set of
 * cluster + point features that should be rendered for the current viewport,
 * recomputed on map move/zoom.
 *
 * `points` should already be filtered (e.g. by the user's score filters) —
 * the hook just buckets whatever it's given. Pass a stable `props` payload
 * per point so consumers can reach the underlying spot from a feature.
 *
 * Tuning notes:
 * - `radius: 60` is the default and reads well at the divIcon sizes we use.
 * - `maxZoom: 14` stops clustering before the deepest zoom levels so users
 *   who zoom in to a neighborhood always see individual pins. The map's
 *   `maxZoom` is 17, so this leaves three levels of "everything separated".
 */
export interface ClusterPointProps<T extends AnyProps> {
  spotId: number;
  payload: T;
}

type ClusterableFeature<T extends AnyProps> =
  | ClusterFeature<AnyProps>
  | PointFeature<ClusterPointProps<T>>;

export function isClusterFeature(
  f: ClusterableFeature<AnyProps>,
): f is ClusterFeature<AnyProps> {
  return Boolean(f.properties && (f.properties as { cluster?: boolean }).cluster);
}

interface UseSuperclusterArgs<T extends AnyProps> {
  points: Array<{ id: number; lat: number; lng: number; payload: T }>;
  /** Stop clustering above this zoom — individual pins from here on. */
  maxClusterZoom?: number;
  /** Pixel radius for cluster grouping. */
  radius?: number;
}

interface UseSuperclusterResult<T extends AnyProps> {
  clusters: Array<ClusterableFeature<T>>;
  supercluster: Supercluster<ClusterPointProps<T>, AnyProps> | null;
  zoom: number;
}

export function useSupercluster<T extends AnyProps>({
  points,
  maxClusterZoom = 14,
  radius = 60,
}: UseSuperclusterArgs<T>): UseSuperclusterResult<T> {
  const map = useMap();
  const [viewport, setViewport] = useState(() => ({
    zoom: map.getZoom(),
    // Use the world bounds initially so the first paint includes everything;
    // the real bounds land on the next map event.
    bounds: [-180, -85, 180, 85] as [number, number, number, number],
  }));

  useEffect(() => {
    const update = () => {
      const b = map.getBounds();
      setViewport({
        zoom: map.getZoom(),
        bounds: [
          b.getWest(),
          b.getSouth(),
          b.getEast(),
          b.getNorth(),
        ],
      });
    };
    update();
    // `moveend` covers pan + zoom completion. We deliberately do *not*
    // listen to `move`/`zoom` (mid-gesture) — recomputing clusters every
    // frame is what made the old map feel laggy on dense areas.
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [map]);

  const supercluster = useMemo(() => {
    const index = new Supercluster<ClusterPointProps<T>, AnyProps>({
      radius,
      maxZoom: maxClusterZoom,
      minPoints: 2,
    });
    const features: Array<PointFeature<ClusterPointProps<T>>> = points.map((p) => ({
      type: 'Feature',
      properties: { spotId: p.id, payload: p.payload },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    }));
    index.load(features);
    return index;
  }, [points, radius, maxClusterZoom]);

  const clusters = useMemo(() => {
    if (!supercluster) return [];
    return supercluster.getClusters(viewport.bounds, Math.round(viewport.zoom)) as Array<
      ClusterableFeature<T>
    >;
  }, [supercluster, viewport]);

  return { clusters, supercluster, zoom: viewport.zoom };
}

import type { Spot } from './spots';
import photoManifest from './spotPhotoManifest.json';

export interface SpotPhoto {
  id: string;
  src: string;
  alt: string;
  view?: string;
  context: string;
  dateLabel: string;
  photographer: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  bytes?: number;
  width?: number;
  height?: number;
  sha256?: string;
}

export interface SpotDiscovery {
  collection?: 'hidden-gems';
  view: string;
  reviewedOn: string;
  verification: 'desk-researched';
  locationSourceUrl: string;
  locationPrecision: 'viewpoint' | 'park';
  sources: ReadonlyArray<{ platform: 'Reddit' | 'TikTok' | 'Instagram' | 'Park guide' | 'Photo archive'; url: string }>;
  photos: ReadonlyArray<SpotPhoto>;
}

const sunsetThread = 'https://www.reddit.com/r/AskSF/comments/1t6jpaa/what_are_some_place_in_sf_to_watch_the_sunset/';
const parksThread = 'https://www.reddit.com/r/AskSF/comments/khng2q/whats_your_favorite_lesserknown_city_park/';
const review = { collection: 'hidden-gems', reviewedOn: '2026-10-11', verification: 'desk-researched' } as const;

// Editorial discovery is separate from the weather score and its confidence.
// Dates refer to a source review, not a visit or a promise of current access.
export const SPOT_DISCOVERY: Readonly<Record<string, SpotDiscovery>> = {
  'sf-sunset-reservoir': {
    ...review, view: 'Pacific Ocean beyond the Sunset District rooftops, from the northwest walking path.',
    locationSourceUrl: 'https://www.openstreetmap.org/way/1293746848', locationPrecision: 'park',
    sources: [{ platform: 'Reddit', url: sunsetThread }], photos: [],
  },
  'sf-brooks-park': {
    ...review, view: 'Pacific Ocean and Mount Tamalpais from the hilltop. The Farallon Islands can be visible on clear days.',
    locationSourceUrl: 'https://www.openstreetmap.org/way/193055100', locationPrecision: 'park',
    sources: [{ platform: 'Reddit', url: parksThread }, { platform: 'Park guide', url: 'https://sfrecpark.org/facilities/facility/details/Brooks-Park-153' }], photos: [],
  },
  'sf-immigrant-point': {
    ...review, view: 'Pacific Ocean and Marin Headlands. The Golden Gate Bridge is not visible from this overlook.',
    locationSourceUrl: 'https://www.openstreetmap.org/node/665689214', locationPrecision: 'viewpoint',
    sources: [{ platform: 'Reddit', url: sunsetThread }, { platform: 'Park guide', url: 'https://presidio.gov/explore/attractions/immigrant-point-overlook' }], photos: [],
  },
  'sf-pacific-overlook': {
    ...review, view: 'Pacific Ocean and the Golden Gate Bridge above the coastal bluffs.',
    locationSourceUrl: 'https://www.openstreetmap.org/node/4207307534', locationPrecision: 'viewpoint',
    sources: [{ platform: 'Reddit', url: sunsetThread }, { platform: 'Park guide', url: 'https://presidio.gov/explore/attractions/pacific-overlook' }],
    photos: [],
  },
  'sf-panorama-park': {
    ...review, view: 'Bay Bridge and San Francisco skyline across the bay, beside the Point of Infinity sculpture.',
    locationSourceUrl: 'https://www.openstreetmap.org/way/1232537986', locationPrecision: 'viewpoint',
    sources: [{ platform: 'TikTok', url: 'https://www.tiktok.com/@erinlovesfun/video/7515149684701154590' }, { platform: 'Park guide', url: 'https://recpark.sf.gov/Facilities/Facility/Details/Panorama-Park-476' }],
    photos: [],
  },
  'sf-tank-hill': {
    ...review, view: 'City rooftops, downtown and distant hills from the summit.',
    locationSourceUrl: 'https://sfrecpark.org/Facilities', locationPrecision: 'viewpoint',
    sources: [{ platform: 'Reddit', url: parksThread }],
    photos: [],
  },
  'sf-sutro-heights': {
    ...review, view: 'Ocean Beach and the Pacific Ocean framed by coastal trees.',
    locationSourceUrl: 'https://www.nps.gov/goga/planyourvisit/sutro-heights.htm', locationPrecision: 'park',
    sources: [{ platform: 'Reddit', url: parksThread }],
    photos: [],
  },
};

export function getSpotDiscovery(spot: Pick<Spot, 'id' | 'visibility'>): SpotDiscovery | undefined {
  if (spot.visibility === 'private') return undefined;
  const photos = (photoManifest as Readonly<Record<string, SpotDiscovery>>)[spot.id];
  const discovery = SPOT_DISCOVERY[spot.id];
  if (!photos) return discovery;
  return { ...photos, ...discovery, photos: photos.photos };
}

export function isHiddenGem(spot: Pick<Spot, 'id' | 'visibility'>): boolean {
  return getSpotDiscovery(spot)?.collection === 'hidden-gems';
}

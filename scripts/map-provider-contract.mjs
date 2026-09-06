export const APPROVED_OPEN_FREE_MAP_STYLES = [
  'https://tiles.openfreemap.org/styles/liberty',
  'https://tiles.openfreemap.org/styles/positron',
];

const ATTRIBUTION_LINKS = [
  'https://openfreemap.org/',
  'https://openmaptiles.org/',
  'https://www.openstreetmap.org/copyright',
];

const KNOWN_ALTERNATE_MAP_PROVIDER = /basemaps\.cartocdn\.com|tiles\.stadiamaps\.com|api\.mapbox\.com|api\.maptiler\.com|tile\.openstreetmap\.org|tile\.thunderforest\.com/i;
const MAP_CREDENTIAL = /tiles\.openfreemap\.org[^'"`\s]*(?:\?|&)(?:api_?key|apikey|access_token)=/i;

export function inspectMapProviderContract({ mapLayer, mapView, sourceCorpus }) {
  const hasApprovedStyles = APPROVED_OPEN_FREE_MAP_STYLES.every((url) => mapLayer.includes(url));
  const hasLinkedAttribution = ATTRIBUTION_LINKS.every((url) => mapLayer.includes(url));
  const layerIsWired = /import\s+OpenFreeMapLayer\b/.test(mapView)
    && /<OpenFreeMapLayer\b/.test(mapView)
    && !/<TileLayer\b/.test(sourceCorpus);
  const hasKnownAlternateProvider = KNOWN_ALTERNATE_MAP_PROVIDER.test(sourceCorpus);
  const hasMapCredential = MAP_CREDENTIAL.test(sourceCorpus);

  return {
    eligible: hasApprovedStyles
      && hasLinkedAttribution
      && layerIsWired
      && !hasKnownAlternateProvider
      && !hasMapCredential,
    hasApprovedStyles,
    hasLinkedAttribution,
    layerIsWired,
    hasKnownAlternateProvider,
    hasMapCredential,
  };
}

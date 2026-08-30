import { describe, expect, it } from 'vitest';
// The release verifier runs as Node ESM, so its pure contract stays in scripts.
// @ts-expect-error The JavaScript release helper intentionally has no TypeScript declaration.
import { inspectMapProviderContract } from '../../../scripts/map-provider-contract.mjs';

const mapLayer = `
  https://tiles.openfreemap.org/styles/liberty
  https://tiles.openfreemap.org/styles/positron
  https://openfreemap.org/
  https://openmaptiles.org/
  https://www.openstreetmap.org/copyright
`;
const mapView = `
  import OpenFreeMapLayer from './OpenFreeMapLayer';
  export function MapView() { return <OpenFreeMapLayer />; }
`;

describe('map provider release contract', () => {
  it('accepts the wired, attributed, credential-free OpenFreeMap layer', () => {
    expect(inspectMapProviderContract({ mapLayer, mapView, sourceCorpus: mapView })).toMatchObject({
      eligible: true,
      layerIsWired: true,
      hasKnownAlternateProvider: false,
      hasMapCredential: false,
    });
  });

  it('fails when the approved layer is disconnected from MapView', () => {
    const result = inspectMapProviderContract({
      mapLayer,
      mapView: 'export function MapView() { return <div />; }',
      sourceCorpus: '',
    });
    expect(result.eligible).toBe(false);
    expect(result.layerIsWired).toBe(false);
  });

  it.each([
    'https://basemaps.cartocdn.com/rastertiles/voyager/0/0/0.png',
    'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    'https://api.mapbox.com/styles/v1/example',
  ])('fails when a known alternate provider is committed: %s', (providerUrl) => {
    const result = inspectMapProviderContract({
      mapLayer,
      mapView,
      sourceCorpus: `${mapView}\n${providerUrl}`,
    });
    expect(result.eligible).toBe(false);
    expect(result.hasKnownAlternateProvider).toBe(true);
  });

  it('fails when an OpenFreeMap credential is committed outside the layer file', () => {
    const result = inspectMapProviderContract({
      mapLayer,
      mapView,
      sourceCorpus: `${mapView}\nhttps://tiles.openfreemap.org/styles/liberty?api_key=committed`,
    });
    expect(result.eligible).toBe(false);
    expect(result.hasMapCredential).toBe(true);
  });
});

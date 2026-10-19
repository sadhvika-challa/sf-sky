import type { Spot } from './spots';

// Curated estimates, not observed sky conditions. Terrain elevations were
// checked with Open-Meteo; public location sources live in spotDiscovery.ts.
export const sfHiddenGemSpots: Spot[] = [
  {
    id: 'sf-sunset-reservoir', name: 'Sunset Reservoir, Northwest Benches',
    lat: 37.7520, lng: -122.4858, city: 'sf', category: 'hill', elevation: 98,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 40, sunset: 84, stargazing: 30,
    accessAlert: { type: 'info', message: 'Use the public walking path near 28th Avenue and Ortega Street. Stay outside the fenced reservoir and follow posted walkway notices.' },
  },
  {
    id: 'sf-brooks-park', name: 'Brooks Park',
    lat: 37.7173234, lng: -122.4667107, city: 'sf', category: 'hill', elevation: 135,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 45, sunset: 79, stargazing: 35,
    accessAlert: { type: 'hours', message: 'Park hours: 5 AM to midnight. Enter from Ramsell Street and stay on public park paths.' },
  },
  {
    id: 'sf-immigrant-point', name: 'Immigrant Point Overlook',
    lat: 37.7961682, lng: -122.4778750, city: 'sf', category: 'coastal-bluff', elevation: 78,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 35, sunset: 85, stargazing: 40,
  },
  {
    id: 'sf-pacific-overlook', name: 'Pacific Overlook',
    lat: 37.8008203, lng: -122.4779624, city: 'sf', category: 'coastal-bluff', elevation: 69,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 35, sunset: 86, stargazing: 40,
    accessAlert: { type: 'hike', message: 'No parking at the overlook. Reach it on the public Coastal Trail from nearby parking or transit.' },
  },
  {
    id: 'sf-panorama-park', name: 'Panorama Park, Yerba Buena Island',
    lat: 37.8104840, lng: -122.3688752, city: 'sf', category: 'hill', elevation: 92,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 72, sunset: 83, stargazing: 20,
    accessAlert: { type: 'hours', message: 'Park hours: 5 AM to midnight. Use public entrances on Yerba Buena Road and follow posted park signs.' },
  },
];

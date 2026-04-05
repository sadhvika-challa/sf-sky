export type SpotCategory = 'hilltop' | 'waterfront' | 'park';

export interface Spot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category: SpotCategory;
  elevation: number; // meters
  lightPollution: 'Low' | 'Mid' | 'High';
  horizonQuality: 'Open' | 'Partial' | 'Blocked';
  sunrise: number;   // 0-100
  sunset: number;    // 0-100
  stargazing: number; // 0-100
}

export const spots: Spot[] = [
  {
    id: 1, name: "Ocean Beach",
    lat: 37.7594, lng: -122.5107,
    category: 'waterfront', elevation: 3,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 25, sunset: 95, stargazing: 55,
  },
  {
    id: 2, name: "Lands End / Sutro Baths",
    lat: 37.7803, lng: -122.5115,
    category: 'waterfront', elevation: 60,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 35, sunset: 92, stargazing: 60,
  },
  {
    id: 3, name: "Fort Funston",
    lat: 37.7148, lng: -122.5026,
    category: 'waterfront', elevation: 60,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 20, sunset: 90, stargazing: 65,
  },
  {
    id: 4, name: "Golden Gate Park — Hippie Hill",
    lat: 37.7694, lng: -122.4530,
    category: 'park', elevation: 30,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 40, sunset: 50, stargazing: 30,
  },
  {
    id: 5, name: "Golden Gate Park — Strawberry Hill",
    lat: 37.7690, lng: -122.4758,
    category: 'park', elevation: 128,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 55, sunset: 65, stargazing: 40,
  },
  {
    id: 6, name: "Sutro Heights Park",
    lat: 37.7782, lng: -122.5105,
    category: 'hilltop', elevation: 61,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 88, stargazing: 58,
  },
  {
    id: 7, name: "Twin Peaks",
    lat: 37.7544, lng: -122.4477,
    category: 'hilltop', elevation: 282,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 90, sunset: 92, stargazing: 72,
  },
  {
    id: 8, name: "Corona Heights Park",
    lat: 37.7654, lng: -122.4390,
    category: 'hilltop', elevation: 155,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 70, sunset: 75, stargazing: 48,
  },
  {
    id: 9, name: "Buena Vista Park",
    lat: 37.7688, lng: -122.4418,
    category: 'park', elevation: 175,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 65, sunset: 70, stargazing: 42,
  },
  {
    id: 10, name: "Dolores Park",
    lat: 37.7596, lng: -122.4269,
    category: 'park', elevation: 61,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 45, sunset: 72, stargazing: 20,
  },
  {
    id: 11, name: "Grandview Park",
    lat: 37.7557, lng: -122.4710,
    category: 'hilltop', elevation: 227,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 78, sunset: 85, stargazing: 55,
  },
  {
    id: 12, name: "Bernal Heights Park",
    lat: 37.7432, lng: -122.4155,
    category: 'hilltop', elevation: 130,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 82, sunset: 80, stargazing: 50,
  },
  {
    id: 13, name: "Crissy Field",
    lat: 37.8039, lng: -122.4650,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 55, sunset: 85, stargazing: 35,
  },
  {
    id: 14, name: "Marina Green",
    lat: 37.8065, lng: -122.4370,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 50, sunset: 78, stargazing: 28,
  },
  {
    id: 15, name: "Fort Mason Great Meadow",
    lat: 37.8050, lng: -122.4310,
    category: 'park', elevation: 20,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 55, sunset: 74, stargazing: 25,
  },
  {
    id: 16, name: "Huntington Park",
    lat: 37.7923, lng: -122.4120,
    category: 'park', elevation: 107,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 35, sunset: 40, stargazing: 12,
  },
  {
    id: 17, name: "Ina Coolbrith Park",
    lat: 37.7983, lng: -122.4140,
    category: 'hilltop', elevation: 91,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 55, sunset: 60, stargazing: 18,
  },
  {
    id: 18, name: "Coit Tower / Pioneer Park",
    lat: 37.8024, lng: -122.4058,
    category: 'hilltop', elevation: 82,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 75, sunset: 68, stargazing: 22,
  },
  {
    id: 19, name: "Washington Square Park",
    lat: 37.8009, lng: -122.4103,
    category: 'park', elevation: 12,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 20, sunset: 30, stargazing: 8,
  },
  {
    id: 20, name: "Portsmouth Square",
    lat: 37.7953, lng: -122.4050,
    category: 'park', elevation: 25,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 22, stargazing: 5,
  },
  {
    id: 21, name: "Alta Plaza Park",
    lat: 37.7910, lng: -122.4380,
    category: 'park', elevation: 72,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 55, sunset: 62, stargazing: 25,
  },
  {
    id: 22, name: "Lafayette Park",
    lat: 37.7918, lng: -122.4285,
    category: 'park', elevation: 107,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 50, sunset: 58, stargazing: 22,
  },
  {
    id: 23, name: "McLaren Park",
    lat: 37.7190, lng: -122.4200,
    category: 'park', elevation: 155,
    lightPollution: 'Low', horizonQuality: 'Partial',
    sunrise: 60, sunset: 65, stargazing: 62,
  },
  {
    id: 24, name: "India Basin Shoreline Park",
    lat: 37.7370, lng: -122.3780,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 78, sunset: 45, stargazing: 32,
  },
  {
    id: 25, name: "Rincon Park",
    lat: 37.7906, lng: -122.3883,
    category: 'waterfront', elevation: 2,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 68, sunset: 55, stargazing: 10,
  },
];

export function getConditionLabel(score: number): string {
  if (score >= 80) return 'Radiant';
  if (score >= 60) return 'Clear';
  if (score >= 40) return 'Subdued';
  return 'Obscured';
}

export function getPoetic(type: 'sunrise' | 'sunset' | 'stargazing', score: number): string {
  if (type === 'sunrise') {
    if (score >= 80) return 'Shades of coral, gold, & rose';
    if (score >= 60) return 'Soft pinks & warming amber';
    if (score >= 40) return 'Gentle peach & muted lilac';
    return 'Pale gray with hints of blush';
  }
  if (type === 'sunset') {
    if (score >= 80) return 'Shades of scarlet, orange, & lavender';
    if (score >= 60) return 'Warm amber & dusky violet';
    if (score >= 40) return 'Muted rose & fading copper';
    return 'Overcast gray with dim ochre';
  }
  if (score >= 80) return 'Deep indigo & scattered starlight';
  if (score >= 60) return 'Navy skies with visible constellations';
  if (score >= 40) return 'Dim stars behind city haze';
  return 'Washed out by ambient light';
}

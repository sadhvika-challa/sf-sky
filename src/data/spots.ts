export type SpotCategory = 'hilltop' | 'waterfront' | 'park';

export type AccessAlertType = 'hike' | 'tide' | 'hours' | 'paid' | 'info';

// Optional, sparingly applied. Only attach when there's something a visitor
// genuinely needs to know before going (gate hours, tide windows, hike
// requirements, paid venues). Most spots intentionally have no alert.
export interface AccessAlert {
  message: string;
  type: AccessAlertType;
}

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
  accessAlert?: AccessAlert;
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
  // FLAG: id 19 (Washington Square Park) and id 48 (Joe DiMaggio Playground)
  // sit within ~0.001° of each other. The playground is technically inside
  // the same block as the square — kept separate for now because they have
  // distinct entrances and use cases. Revisit if we ever consolidate.
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
  // — Additional SF Parks —
  {
    id: 26, name: "Glen Canyon Park",
    lat: 37.7410, lng: -122.4430,
    category: 'park', elevation: 90,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 50, sunset: 55, stargazing: 45,
  },
  {
    id: 27, name: "Mount Davidson Park",
    lat: 37.7380, lng: -122.4545,
    category: 'hilltop', elevation: 282,
    lightPollution: 'Low', horizonQuality: 'Partial',
    sunrise: 72, sunset: 78, stargazing: 68,
  },
  // FLAG: id 28 (Stern Grove) and id 74 (Sigmund Stern Recreation Grove) are
  // ~0.002° apart and arguably the same park. Kept separate because the
  // existing entries cover slightly different sub-areas (meadow vs. rec
  // grove) — review if/when we add proper sub-area metadata.
  {
    id: 28, name: "Stern Grove",
    lat: 37.7370, lng: -122.4710,
    category: 'park', elevation: 30,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 20, sunset: 25, stargazing: 30,
  },
  {
    id: 29, name: "Pine Lake Park",
    lat: 37.7375, lng: -122.4780,
    category: 'park', elevation: 40,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 30, sunset: 35, stargazing: 35,
  },
  {
    id: 30, name: "Balboa Park",
    lat: 37.7215, lng: -122.4415,
    category: 'park', elevation: 20,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 22, stargazing: 15,
  },
  {
    id: 31, name: "Crocker Amazon Park",
    lat: 37.7105, lng: -122.4335,
    category: 'park', elevation: 30,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 30, sunset: 35, stargazing: 25,
  },
  {
    id: 32, name: "John McLaren Park — Philosopher's Way",
    lat: 37.7185, lng: -122.4145,
    category: 'park', elevation: 155,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 65, sunset: 70, stargazing: 60,
  },
  {
    id: 33, name: "Bayview Park",
    lat: 37.7305, lng: -122.3920,
    category: 'hilltop', elevation: 90,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 72, sunset: 65, stargazing: 38,
  },
  {
    id: 34, name: "Heron's Head Park",
    lat: 37.7385, lng: -122.3725,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 75, sunset: 40, stargazing: 28,
  },
  {
    id: 35, name: "Candlestick Point SRA",
    lat: 37.7130, lng: -122.3830,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 70, sunset: 50, stargazing: 30,
  },
  {
    id: 36, name: "Potrero Hill Mini Park",
    lat: 37.7605, lng: -122.3990,
    category: 'hilltop', elevation: 90,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 72, sunset: 70, stargazing: 18,
  },
  {
    id: 37, name: "McKinley Square Park",
    lat: 37.7590, lng: -122.4040,
    category: 'hilltop', elevation: 60,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 55, sunset: 52, stargazing: 15,
  },
  {
    id: 38, name: "Holly Park",
    lat: 37.7415, lng: -122.4260,
    category: 'hilltop', elevation: 85,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 68, sunset: 72, stargazing: 35,
  },
  {
    id: 39, name: "Precita Park",
    lat: 37.7475, lng: -122.4120,
    category: 'park', elevation: 30,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 20, sunset: 25, stargazing: 10,
  },
  {
    id: 40, name: "St. Mary's Park",
    lat: 37.7365, lng: -122.4200,
    category: 'park', elevation: 55,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 40, sunset: 45, stargazing: 28,
  },
  {
    id: 41, name: "Garfield Square",
    lat: 37.7560, lng: -122.4130,
    category: 'park', elevation: 20,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 8,
  },
  {
    id: 42, name: "Jackson Park",
    lat: 37.7522, lng: -122.3975,
    category: 'park', elevation: 15,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 20, stargazing: 8,
  },
  {
    id: 43, name: "Esprit Park",
    lat: 37.7618, lng: -122.3905,
    category: 'park', elevation: 5,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 22, sunset: 25, stargazing: 5,
  },
  {
    id: 44, name: "South Park",
    lat: 37.7825, lng: -122.3940,
    category: 'park', elevation: 5,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 20, stargazing: 5,
  },
  {
    id: 45, name: "Yerba Buena Gardens",
    lat: 37.7855, lng: -122.4025,
    category: 'park', elevation: 10,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 12, sunset: 15, stargazing: 3,
  },
  {
    id: 46, name: "Sue Bierman Park",
    lat: 37.7960, lng: -122.3970,
    category: 'park', elevation: 5,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 60, sunset: 40, stargazing: 5,
  },
  {
    id: 47, name: "Sidney Walton Park",
    lat: 37.7985, lng: -122.3990,
    category: 'park', elevation: 5,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 3,
  },
  {
    id: 48, name: "Joe DiMaggio Playground",
    lat: 37.8010, lng: -122.4105,
    category: 'park', elevation: 15,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 5,
  },
  // id 49 ("Pioneer Park (Telegraph Hill)") removed — exact duplicate of
  // id 18 ("Coit Tower / Pioneer Park"). IDs are stable identifiers, so 49
  // is intentionally left as a gap rather than reused.
  {
    id: 50, name: "Michelangelo Playground",
    lat: 37.8000, lng: -122.4155,
    category: 'park', elevation: 25,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 5,
  },
  {
    id: 51, name: "Moscone Park",
    lat: 37.8005, lng: -122.4300,
    category: 'park', elevation: 10,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 35, sunset: 45, stargazing: 15,
  },
  {
    id: 52, name: "George Sterling Park",
    lat: 37.7965, lng: -122.4175,
    category: 'park', elevation: 75,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 45, sunset: 50, stargazing: 15,
  },
  {
    id: 53, name: "Allyne Park",
    lat: 37.7960, lng: -122.4230,
    category: 'park', elevation: 55,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 40, sunset: 45, stargazing: 18,
  },
  {
    id: 54, name: "Pacific Heights Park (Lyon Street Steps)",
    lat: 37.7945, lng: -122.4470,
    category: 'park', elevation: 60,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 50, sunset: 55, stargazing: 20,
  },
  {
    id: 55, name: "Presidio Main Post",
    lat: 37.7990, lng: -122.4580,
    category: 'park', elevation: 35,
    lightPollution: 'Low', horizonQuality: 'Partial',
    sunrise: 45, sunset: 60, stargazing: 48,
  },
  {
    id: 56, name: "Presidio — Inspiration Point",
    lat: 37.7930, lng: -122.4650,
    category: 'hilltop', elevation: 120,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 70, sunset: 82, stargazing: 55,
  },
  {
    id: 57, name: "Presidio — Lovers' Lane",
    lat: 37.7960, lng: -122.4615,
    category: 'park', elevation: 50,
    lightPollution: 'Low', horizonQuality: 'Partial',
    sunrise: 35, sunset: 45, stargazing: 45,
  },
  {
    id: 58, name: "Baker Beach",
    lat: 37.7935, lng: -122.4835,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 90, stargazing: 52,
  },
  {
    id: 59, name: "Mountain Lake Park",
    lat: 37.7880, lng: -122.4700,
    category: 'park', elevation: 40,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 30, sunset: 40, stargazing: 30,
  },
  {
    id: 60, name: "Rossi Playground & Park",
    lat: 37.7825, lng: -122.4530,
    category: 'park', elevation: 40,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 20, stargazing: 12,
  },
  {
    id: 61, name: "Panhandle Park",
    lat: 37.7720, lng: -122.4405,
    category: 'park', elevation: 30,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 20, sunset: 25, stargazing: 12,
  },
  {
    id: 62, name: "Alamo Square Park",
    lat: 37.7762, lng: -122.4350,
    category: 'park', elevation: 65,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 55, sunset: 62, stargazing: 22,
  },
  {
    id: 63, name: "Jefferson Square Park",
    lat: 37.7815, lng: -122.4270,
    category: 'park', elevation: 20,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 8,
  },
  {
    id: 64, name: "Hayes Valley Playground",
    lat: 37.7755, lng: -122.4290,
    category: 'park', elevation: 20,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 8,
  },
  {
    id: 65, name: "Duboce Park",
    lat: 37.7695, lng: -122.4335,
    category: 'park', elevation: 35,
    lightPollution: 'High', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 22, stargazing: 10,
  },
  {
    id: 66, name: "Mission Dolores Park — Upper Terraces",
    lat: 37.7610, lng: -122.4270,
    category: 'park', elevation: 80,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 55, sunset: 68, stargazing: 18,
  },
  {
    id: 67, name: "Noe Valley Courts",
    lat: 37.7502, lng: -122.4320,
    category: 'park', elevation: 90,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 45, sunset: 50, stargazing: 22,
  },
  {
    id: 68, name: "Billy Goat Hill Park",
    lat: 37.7440, lng: -122.4370,
    category: 'hilltop', elevation: 115,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 72, sunset: 75, stargazing: 42,
  },
  {
    id: 69, name: "Walter Haas Playground",
    lat: 37.7395, lng: -122.4440,
    category: 'park', elevation: 70,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 35, sunset: 40, stargazing: 28,
  },
  {
    id: 70, name: "Sunnyside Playground",
    lat: 37.7325, lng: -122.4490,
    category: 'park', elevation: 50,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 20, sunset: 22, stargazing: 18,
  },
  {
    id: 71, name: "Miraloma Park",
    lat: 37.7375, lng: -122.4560,
    category: 'park', elevation: 140,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 55, sunset: 60, stargazing: 40,
  },
  {
    id: 72, name: "West Portal Playground",
    lat: 37.7400, lng: -122.4660,
    category: 'park', elevation: 55,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 20, stargazing: 15,
  },
  {
    id: 73, name: "Larsen Park",
    lat: 37.7465, lng: -122.4870,
    category: 'park', elevation: 45,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 22, sunset: 28, stargazing: 18,
  },
  {
    id: 74, name: "Sigmund Stern Recreation Grove",
    lat: 37.7350, lng: -122.4730,
    category: 'park', elevation: 45,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 22, stargazing: 20,
  },
  {
    id: 75, name: "Lake Merced Park",
    lat: 37.7275, lng: -122.4930,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 40, sunset: 55, stargazing: 55,
  },
  {
    id: 76, name: "Brotherhood Mini Park",
    lat: 37.7265, lng: -122.4525,
    category: 'park', elevation: 70,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 30, sunset: 35, stargazing: 22,
  },
  {
    id: 77, name: "Visitacion Valley Greenway",
    lat: 37.7160, lng: -122.4075,
    category: 'park', elevation: 25,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 18, sunset: 20, stargazing: 12,
  },
  {
    id: 78, name: "Cayuga Park",
    lat: 37.7230, lng: -122.4395,
    category: 'park', elevation: 30,
    lightPollution: 'Mid', horizonQuality: 'Blocked',
    sunrise: 15, sunset: 18, stargazing: 12,
  },
  {
    id: 79, name: "Golden Gate Park — Spreckels Lake",
    lat: 37.7726, lng: -122.4865,
    category: 'park', elevation: 25,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 30, sunset: 40, stargazing: 28,
  },
  {
    id: 80, name: "Golden Gate Park — Prayer Book Cross",
    lat: 37.7720, lng: -122.4615,
    category: 'park', elevation: 55,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 42, sunset: 50, stargazing: 32,
  },
  {
    id: 81, name: "Tank Hill Park",
    lat: 37.7610, lng: -122.4480,
    category: 'hilltop', elevation: 200,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 82, sunset: 85, stargazing: 52,
  },
  {
    id: 82, name: "Kite Hill Open Space",
    lat: 37.7575, lng: -122.4415,
    category: 'hilltop', elevation: 220,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 80, sunset: 82, stargazing: 48,
  },
  {
    id: 83, name: "Hawk Hill (Marin Headlands)",
    lat: 37.8260, lng: -122.4990,
    category: 'hilltop', elevation: 280,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 85, sunset: 95, stargazing: 78,
  },
  {
    id: 84, name: "Aquatic Park",
    lat: 37.8067, lng: -122.4225,
    category: 'waterfront', elevation: 2,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 55, sunset: 70, stargazing: 12,
  },
  {
    id: 85, name: "Crane Cove Park",
    lat: 37.7625, lng: -122.3825,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 72, sunset: 48, stargazing: 18,
  },
  {
    id: 86, name: "Warm Water Cove Park",
    lat: 37.7570, lng: -122.3850,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 68, sunset: 45, stargazing: 15,
  },
  {
    id: 87, name: "Islais Creek Promenade",
    lat: 37.7480, lng: -122.3810,
    category: 'waterfront', elevation: 2,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 70, sunset: 42, stargazing: 18,
  },
  // — Regional spots beyond central SF —
  // Travel times computed from straight-line distance are very rough for
  // these; treat anything > ~15 mi from downtown as a day trip. Hawk Hill
  // (id 83) already covers the Marin Headlands ridge — do not re-add.
  // — Marin / North —
  {
    id: 88, name: "Mount Tamalpais — East Peak",
    lat: 37.9235, lng: -122.5965,
    category: 'hilltop', elevation: 784,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 88, sunset: 96, stargazing: 92,
  },
  {
    id: 89, name: "Battery Spencer",
    lat: 37.8320, lng: -122.4830,
    category: 'hilltop', elevation: 75,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 70, sunset: 92, stargazing: 38,
  },
  {
    id: 90, name: "Muir Beach Overlook",
    lat: 37.8595, lng: -122.5720,
    category: 'waterfront', elevation: 46,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 35, sunset: 92, stargazing: 78,
  },
  {
    id: 91, name: "Muir Beach",
    lat: 37.8590, lng: -122.5800,
    category: 'waterfront', elevation: 3,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 88, stargazing: 72,
  },
  {
    id: 92, name: "Bolinas Ridge",
    lat: 37.9380, lng: -122.6600,
    category: 'hilltop', elevation: 460,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 80, sunset: 92, stargazing: 90,
    accessAlert: {
      message: "Road closes 30 min after sunset. Get there early. Winding drive from Fairfax, ~45 min from SF.",
      type: 'hours',
    },
  },
  {
    id: 93, name: "Rodeo Beach",
    lat: 37.8340, lng: -122.5400,
    category: 'waterfront', elevation: 3,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 82, stargazing: 70,
  },
  {
    id: 94, name: "Point Reyes — Chimney Rock",
    lat: 38.0020, lng: -122.9640,
    category: 'waterfront', elevation: 30,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 60, sunset: 90, stargazing: 96,
  },
  {
    id: 95, name: "Stinson Beach",
    lat: 37.8970, lng: -122.6400,
    category: 'waterfront', elevation: 3,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 32, sunset: 90, stargazing: 72,
  },
  // — East Bay —
  {
    id: 96, name: "Grizzly Peak",
    lat: 37.8800, lng: -122.2430,
    category: 'hilltop', elevation: 550,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 75, sunset: 94, stargazing: 55,
  },
  {
    id: 97, name: "Treasure Island Viewpoint",
    lat: 37.8197, lng: -122.3700,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 82, sunset: 88, stargazing: 30,
  },
  {
    id: 98, name: "Lake Merritt",
    lat: 37.8022, lng: -122.2600,
    category: 'park', elevation: 2,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 38, sunset: 70, stargazing: 8,
  },
  {
    id: 99, name: "Sibley Volcanic Regional Preserve",
    lat: 37.8750, lng: -122.1960,
    category: 'park', elevation: 480,
    lightPollution: 'Low', horizonQuality: 'Partial',
    sunrise: 65, sunset: 70, stargazing: 75,
  },
  {
    id: 100, name: "Mount Diablo — Summit",
    lat: 37.8816, lng: -121.9142,
    category: 'hilltop', elevation: 1173,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 92, sunset: 92, stargazing: 98,
  },
  // — South / Peninsula —
  {
    id: 101, name: "Mori Point",
    lat: 37.6180, lng: -122.4940,
    category: 'waterfront', elevation: 30,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 35, sunset: 92, stargazing: 72,
  },
  {
    id: 102, name: "Pigeon Point Lighthouse",
    lat: 37.1820, lng: -122.3930,
    category: 'waterfront', elevation: 10,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 40, sunset: 90, stargazing: 96,
  },
  {
    id: 103, name: "Rancho Corral de Tierra",
    lat: 37.5290, lng: -122.4560,
    category: 'park', elevation: 120,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 55, sunset: 78, stargazing: 88,
    accessAlert: {
      message: "30 min south of SF in Montara. Open sunrise to sunset — no night access, so plan stargazing for winter when dark comes early.",
      type: 'hours',
    },
  },
  // — Hidden SF spots (id 104+) —
  // These are mostly access-gated: hike-only beaches, tide-dependent coves,
  // and a couple of urban surprises. Several carry an `accessAlert` because
  // showing up unprepared (wrong tide, wrong hours, no shoes) genuinely
  // wrecks the visit.
  {
    id: 104, name: "Marshall's Beach",
    lat: 37.8030, lng: -122.4810,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 85, stargazing: 45,
    accessAlert: {
      message: "Hike-only access via Batteries to Bluffs trail. ~15 min steep descent, 470 stairs. No restrooms or water on the beach.",
      type: 'hike',
    },
  },
  {
    id: 105, name: "China Beach",
    lat: 37.7880, lng: -122.4910,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Mid', horizonQuality: 'Open',
    sunrise: 30, sunset: 80, stargazing: 35,
    accessAlert: {
      message: "Small cove — can get fully submerged at high tide. Check tide tables before going.",
      type: 'tide',
    },
  },
  {
    id: 106, name: "Mullen Peralta Park",
    lat: 37.7390, lng: -122.4210,
    category: 'hilltop', elevation: 110,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 40, sunset: 70, stargazing: 30,
  },
  {
    id: 107, name: "Golden Gate Overlook (Batteries to Bluffs)",
    lat: 37.8060, lng: -122.4770,
    category: 'hilltop', elevation: 60,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 35, sunset: 90, stargazing: 40,
  },
  {
    id: 108, name: "Fort Point",
    lat: 37.8107, lng: -122.4770,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Mid', horizonQuality: 'Partial',
    sunrise: 35, sunset: 75, stargazing: 25,
    accessAlert: {
      message: "Rooftop access is intermittent — check NPS site for current hours. Main area closes at 5 PM most days.",
      type: 'hours',
    },
  },
  {
    id: 109, name: "Lands End Labyrinth",
    lat: 37.7878, lng: -122.5050,
    category: 'waterfront', elevation: 30,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 82, stargazing: 40,
    accessAlert: {
      message: "Off the main Lands End trail on an unmarked spur path. Look for the turnoff about 0.3 mi from the Merrie Way parking lot. Can be slippery when wet.",
      type: 'hike',
    },
  },
  {
    id: 110, name: "Mile Rock Beach",
    lat: 37.7870, lng: -122.5070,
    category: 'waterfront', elevation: 3,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 25, sunset: 78, stargazing: 45,
    accessAlert: {
      message: "Requires a steep scramble down from Lands End trail. Only accessible at low tide — beach disappears at high tide.",
      type: 'tide',
    },
  },
  {
    id: 111, name: "Palace of Fine Arts",
    lat: 37.8020, lng: -122.4485,
    category: 'park', elevation: 5,
    lightPollution: 'High', horizonQuality: 'Partial',
    sunrise: 30, sunset: 65, stargazing: 15,
  },
  {
    id: 112, name: "Pier 7",
    lat: 37.7980, lng: -122.3980,
    category: 'waterfront', elevation: 3,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 70, sunset: 45, stargazing: 10,
  },
  // — Rooftop / elevated venues —
  // High-elevation entries with paid-access alerts. Light pollution is High
  // (downtown), so stargazing scores stay low even though horizons are open.
  {
    id: 113, name: "Cityscape Sky Bar",
    lat: 37.7860, lng: -122.4100,
    category: 'hilltop', elevation: 140,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 50, sunset: 70, stargazing: 10,
    accessAlert: {
      message: "46th floor of Hilton Union Square. Bar — drinks required, no cover. Open 4 PM–midnight daily. 21+ after 10 PM.",
      type: 'paid',
    },
  },
  {
    id: 114, name: "Cavaña Rooftop",
    lat: 37.7710, lng: -122.3910,
    category: 'hilltop', elevation: 55,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 55, sunset: 68, stargazing: 8,
    accessAlert: {
      message: "17th floor of LUMA Hotel, Mission Bay. Open-air bar, no reservations for small parties. Cocktails $15–22.",
      type: 'paid',
    },
  },
  // — Greater Bay Area niche picks (id 115+) —
  // Bolinas Ridge (92) and Rancho Corral de Tierra (103) already cover two
  // of the marquee regional picks; their alerts were added in place above.
  {
    id: 115, name: "Point Bonita Lighthouse",
    lat: 37.8157, lng: -122.5297,
    category: 'waterfront', elevation: 40,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 35, sunset: 85, stargazing: 70,
    accessAlert: {
      message: "Trail to lighthouse open Sat–Mon, 12:30–3:30 PM only. Suspension bridge crossing required — not for those with vertigo.",
      type: 'hours',
    },
  },
  {
    id: 116, name: "Kirby Cove",
    lat: 37.8260, lng: -122.4970,
    category: 'waterfront', elevation: 5,
    lightPollution: 'Low', horizonQuality: 'Open',
    sunrise: 30, sunset: 88, stargazing: 65,
    accessAlert: {
      message: "Permit required for camping. Day-use involves a steep 1-mile trail down from Conzelman Rd. Gate closes at sunset unless camping.",
      type: 'hike',
    },
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

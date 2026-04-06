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
  {
    id: 49, name: "Pioneer Park (Telegraph Hill)",
    lat: 37.8023, lng: -122.4060,
    category: 'hilltop', elevation: 82,
    lightPollution: 'High', horizonQuality: 'Open',
    sunrise: 75, sunset: 68, stargazing: 22,
  },
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

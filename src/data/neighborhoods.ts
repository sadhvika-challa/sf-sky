// Hand-picked SF neighborhood centroids used by Weather mode. We intentionally
// don't derive these from `spots` — the spot list contains 100+ POIs that
// would over-cluster the labels and break the iOS-Weather-style layout we're
// going for. ~25 anchors covers the city evenly so the IDW gradient doesn't
// have any noticeably empty patches between labels.
//
// Centroids for bay-adjacent neighborhoods (Marina, North Beach, Hunters
// Point) sit slightly inland from the actual neighborhood center, so when
// the user is zoomed all the way out the label icon doesn't visually drift
// over the water.

export interface Neighborhood {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export const neighborhoods: Neighborhood[] = [
  { id: 1, name: 'Presidio', lat: 37.7935, lng: -122.4622 },
  { id: 2, name: 'Marina', lat: 37.8005, lng: -122.4378 },
  { id: 3, name: 'North Beach', lat: 37.7995, lng: -122.4103 },
  { id: 4, name: 'Outer Richmond', lat: 37.7763, lng: -122.4920 },
  { id: 5, name: 'Inner Richmond', lat: 37.7800, lng: -122.4640 },
  { id: 6, name: 'Downtown', lat: 37.7898, lng: -122.4090 },
  { id: 7, name: 'SOMA', lat: 37.7785, lng: -122.4056 },
  { id: 8, name: 'Haight', lat: 37.7702, lng: -122.4459 },
  // Fills the gap between Haight, Sunset, and Twin Peaks so the gradient
  // doesn't have a hole in the middle of the city.
  { id: 9, name: 'Cole Valley', lat: 37.7660, lng: -122.4500 },
  { id: 10, name: 'Mission', lat: 37.7599, lng: -122.4148 },
  { id: 11, name: 'Castro', lat: 37.7609, lng: -122.4350 },
  { id: 12, name: 'Noe Valley', lat: 37.7501, lng: -122.4337 },
  { id: 13, name: 'Twin Peaks', lat: 37.7544, lng: -122.4477 },
  // Forest Hill bridges Sunset/Twin Peaks/West Portal — the empty patch
  // the user called out.
  { id: 14, name: 'Forest Hill', lat: 37.7470, lng: -122.4640 },
  { id: 15, name: 'Potrero', lat: 37.7587, lng: -122.4012 },
  { id: 16, name: "Hunter's Point", lat: 37.7320, lng: -122.3850 },
  // Bayview gives the SE quadrant a second anchor instead of leaning on
  // Hunters Point alone.
  { id: 17, name: 'Bayview', lat: 37.7340, lng: -122.3955 },
  { id: 18, name: 'Sunset', lat: 37.7501, lng: -122.4920 },
  // Parkside extends Sunset coverage south so the gradient doesn't fall
  // off before reaching Lake Merced.
  { id: 19, name: 'Parkside', lat: 37.7415, lng: -122.4910 },
  { id: 20, name: 'Lake Merced', lat: 37.7184, lng: -122.4880 },
  { id: 21, name: 'Ingleside', lat: 37.7227, lng: -122.4584 },
  { id: 22, name: 'Excelsior', lat: 37.7240, lng: -122.4290 },
  { id: 23, name: 'Glen Park', lat: 37.7339, lng: -122.4339 },
  { id: 24, name: 'Bernal Heights', lat: 37.7416, lng: -122.4156 },
  // Closes off the southern edge of the city.
  { id: 25, name: 'Visitacion Valley', lat: 37.7155, lng: -122.4060 },
];

// Curated Events — time-bound, visual/atmospheric experiences (laser
// installations, light art, telescope nights, drone shows, outdoor screenings)
// that thematically align with the app's "look up and be moved" identity.
//
// Events are their own data entity. They live alongside spots but never touch
// the scoring engine — they have no 0–100 score. When an event happens *at* an
// existing spot, `spotId` links the two (string id, matching `Spot.id`).

export type EventCategory =
  | 'light-installation'  // laser beams, projection mapping, neon art
  | 'astronomy'           // telescope nights, star parties, observatory events
  | 'screening'           // outdoor film, sunset cinema
  | 'natural-phenomenon'  // supermoon, meteor shower, eclipse, solstice
  | 'art-walk'            // nighttime gallery walks, light festivals
  | 'drone-show';         // drone light shows

export interface CuratedEvent {
  id: string;                    // e.g. 'evt-sf-7x7-civic-center'
  name: string;                  // e.g. 'Photon Ocean — Civic Center Lasers'
  tagline: string;               // Karl-voiced one-liner
  category: EventCategory;
  lat: number;
  lng: number;
  /** If this event happens AT an existing spot, link it (matches `Spot.id`). */
  spotId?: string;
  /** When the event is visible/active. */
  startDate: string;             // ISO date string
  endDate: string;               // ISO date string
  /** Daily active window (some installations only run at night). */
  activeHoursStart?: string;     // e.g. '20:00'
  activeHoursEnd?: string;       // e.g. '02:00'
  /** Short description, 1-2 sentences. Editorial, not promotional. */
  description: string;
  /** Optional external link (artist page, event page). */
  url?: string;
  /** Whether this is a one-night thing or a multi-week installation. */
  recurring: boolean;
  /** Free-form note like access alerts on spots. */
  note?: string;
}

export const curatedEvents: CuratedEvent[] = [
  {
    id: 'evt-sf-7x7-civic-center',
    name: '7x7',
    tagline: '49 lasers cutting through Karl. He never stood a chance.',
    category: 'light-installation',
    lat: 37.7793,
    lng: -122.4184,
    startDate: '2026-06-21',
    endDate: '2026-07-04',
    activeHoursStart: '21:00',
    activeHoursEnd: '05:00',
    description: '49 laser beams over Civic Center Plaza by Illuminate, one for each square mile of the city. Dusk to dawn for 14 nights. Rainbow colors for Pride Weekend, red-white-blue for the Fourth. Best when Karl rolls in -- the fog catches the beams.',
    url: 'https://illuminate.org/projects/7x7/',
    recurring: false,
    note: 'Walk underneath the truss to look straight up through the beams. Free, no tickets needed.',
  },
  {
    id: 'evt-sf-bay-lights-360',
    name: 'The Bay Lights 360',
    tagline: 'The bridge is glowing. Karl can not compete with 48,000 LEDs.',
    category: 'light-installation',
    lat: 37.7983,
    lng: -122.3778,
    startDate: '2026-03-20',
    endDate: '2027-12-31',
    activeHoursStart: '20:30',
    activeHoursEnd: '05:00',
    description: 'Leo Villareal\'s iconic Bay Bridge installation, back after a 3-year rebuild with 48,000 LEDs spanning 1.8 miles. Now visible from both sides of the bridge. Best viewed from the Embarcadero or Pier 7.',
    url: 'https://illuminate.org/projects/thebaylights/',
    recurring: true,
  },
  {
    id: 'evt-sf-photosynthesis-conservatory',
    name: 'Photosynthesis',
    tagline: 'The Conservatory is tripping. Free show every night.',
    category: 'light-installation',
    lat: 37.7714,
    lng: -122.4590,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    activeHoursStart: '21:00',
    activeHoursEnd: '00:00',
    description: 'Seasonal projection-mapped light show on the Conservatory of Flowers by Lumigeek. Psychedelic visuals and music transform the white glasshouse nightly. Bring a blanket and sit on the lawn.',
    url: 'https://gggp.org/photosynthesis-light-show-at-the-conservatory-changes-with-the-seasons/',
    recurring: true,
    note: 'Starts 30 min after sunset, loops until midnight. Best viewing from the lawn on JFK Promenade.',
  },
  {
    id: 'evt-sf-spectra-fulton-plaza',
    name: 'SPECTRA',
    tagline: 'The library roof is alive. Karl is confused.',
    category: 'light-installation',
    lat: 37.7795,
    lng: -122.4159,
    startDate: '2026-04-05',
    endDate: '2027-12-31',
    activeHoursStart: '20:30',
    activeHoursEnd: '00:00',
    description: '1,271 LEDs spanning 1.6 acres across the rooftops of the SF Public Library and Asian Art Museum. Audio-reactive waveforms pulse and shimmer, framing City Hall. By Illuminate.',
    url: 'https://illuminate.org/',
    recurring: true,
    note: 'Pairs well with 7x7 -- both are at Civic Center. Walk between them.',
  },
  {
    id: 'evt-sf-entwined-ggp',
    name: 'Entwined',
    tagline: 'The trees are showing off again. Karl is not invited.',
    category: 'light-installation',
    lat: 37.7710,
    lng: -122.4567,
    spotId: 'sf-hippie-hill', // Golden Gate Park -- near Hippie Hill / Peacock Meadow
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    activeHoursStart: '20:30',
    activeHoursEnd: '23:59',
    description: 'Charles Gadeken\'s LED tree sculptures at Peacock Meadow on JFK Promenade. Climb the roots, sit under the canopy, watch the colors shift. Free nightly since 2020.',
    url: 'https://illuminate.org/',
    recurring: true,
  },
];

/** Returns events that are active right now or today. */
export function getActiveEvents(now: Date = new Date()): CuratedEvent[] {
  const today = now.toISOString().slice(0, 10);
  return curatedEvents.filter((evt) => {
    if (today < evt.startDate || today > evt.endDate) return false;
    // If daily active hours are set, check if current time is in the window.
    if (evt.activeHoursStart && evt.activeHoursEnd) {
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      // Handle overnight windows (e.g. 21:00-02:00)
      if (evt.activeHoursStart > evt.activeHoursEnd) {
        return hhmm >= evt.activeHoursStart || hhmm <= evt.activeHoursEnd;
      }
      return hhmm >= evt.activeHoursStart && hhmm <= evt.activeHoursEnd;
    }
    return true;
  });
}

/** Returns events happening today (active window or not). */
export function getTodaysEvents(now: Date = new Date()): CuratedEvent[] {
  const today = now.toISOString().slice(0, 10);
  return curatedEvents.filter(
    (evt) => today >= evt.startDate && today <= evt.endDate,
  );
}

/** Returns events in the next 7 days. */
export function getUpcomingEvents(now: Date = new Date()): CuratedEvent[] {
  const today = now.toISOString().slice(0, 10);
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + 7);
  const endWindow = weekOut.toISOString().slice(0, 10);
  return curatedEvents.filter(
    (evt) => evt.endDate >= today && evt.startDate <= endWindow,
  );
}

/** Whether `evt` is currently inside its daily active-hours window. */
export function isEventActive(evt: CuratedEvent, now: Date = new Date()): boolean {
  return getActiveEvents(now).some((e) => e.id === evt.id);
}

/**
 * Format an event's daily active window for display, e.g. "9 PM -- 1 AM".
 * Returns "All day" when no daily window is set.
 */
export function formatActiveHours(evt: CuratedEvent): string {
  if (!evt.activeHoursStart || !evt.activeHoursEnd) return 'All day';
  return `${formatClock(evt.activeHoursStart)} – ${formatClock(evt.activeHoursEnd)}`;
}

function formatClock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${mStr.padStart(2, '0')} ${period}`;
}

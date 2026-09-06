// Curated Events — time-bound, visual/atmospheric experiences (laser
// installations, light art, telescope nights, drone shows, outdoor screenings)
// that thematically align with the app's "look up and be moved" identity.
//
// Events are their own data entity. They live alongside spots but never touch
// the scoring engine — they have no 0–100 score. When an event happens *at* an
// existing spot, `spotId` links the two (string id, matching `Spot.id`).

import type { City } from './spots';

export type EventCategory =
  | 'light-installation'  // laser beams, projection mapping, neon art
  | 'astronomy'           // telescope nights, star parties, observatory events
  | 'screening'           // outdoor film, sunset cinema
  | 'natural-phenomenon'  // supermoon, meteor shower, eclipse, solstice
  | 'art-walk'            // nighttime gallery walks, light festivals
  | 'drone-show'          // drone light shows
  | 'fireworks';          // July 4 & NYE fireworks — renders a flag marker, not the diamond

export interface CuratedEvent {
  id: string;                    // e.g. 'evt-sf-7x7-civic-center'
  city: City;
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
    city: 'sf',
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
    city: 'sf',
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
    city: 'sf',
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
    city: 'sf',
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
    city: 'sf',
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
  // July 4, 2026 fireworks viewing pins. Two focal points this year: the Pier 39
  // barge (northern waterfront) and the Golden Gate Bridge display (bridge-mounted
  // + a barge near the Gate) for the 250th. Show ~9:30pm, ~20 min. Window is
  // 21:00-22:30 so pins surface at both the 9pm and 10pm timeline stops.
  {
    id: 'evt-sf-jul4-hawk-hill',
    city: 'sf',
    name: 'Hawk Hill',
    tagline: 'Karl guards the gate. Climb above him and the bridge is yours.',
    category: 'fireworks',
    lat: 37.8260, lng: -122.4990,
    spotId: 'sf-hawk-hill',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'The marquee seat for the Golden Gate Bridge display. At ~280m it usually rides above the marine layer, so even when the waterfront fogs in, the bridge and skyline stay clear. Winding drive up Conzelman Rd.',
    recurring: false,
    note: 'Arrive very early and expect crowds. Conzelman Rd may close to inbound cars near showtime.',
  },
  {
    id: 'evt-sf-jul4-battery-spencer',
    city: 'sf',
    name: 'Battery Spencer',
    tagline: 'Nose to nose with the north tower. If Karl blinks, this is the shot.',
    category: 'fireworks',
    lat: 37.8320, lng: -122.4830,
    spotId: 'sf-battery-spencer',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'The closest land view of the Golden Gate display, right at the north anchorage. Lower and closer to the Gate than Hawk Hill, so higher fog risk, but unbeatable when it clears.',
    recurring: false,
    note: 'Tiny lot, fills hours ahead. Plan to walk in.',
  },
  {
    id: 'evt-sf-jul4-coit-tower',
    city: 'sf',
    name: 'Coit Tower',
    tagline: 'Telegraph Hill sits east of the fog line. Pier 39 lights up right below.',
    category: 'fireworks',
    lat: 37.8024, lng: -122.4058,
    spotId: 'sf-coit-tower',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'Elevated perch straight over the northern waterfront where the Pier 39 barge fires, and far enough east to often stay under the fog. Walkable from Nob Hill through North Beach.',
    recurring: false,
    note: 'Open horizon on the east / Filbert Steps side. Big crowds but the hill absorbs them.',
  },
  {
    id: 'evt-sf-jul4-fort-mason',
    city: 'sf',
    name: 'Fort Mason Great Meadow',
    tagline: 'The bluff Marina Green forgets. Higher ground, same show.',
    category: 'fireworks',
    lat: 37.8050, lng: -122.4310,
    spotId: 'sf-fort-mason',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'The east-facing bluff between the Marina and Aquatic Park gives a direct line to the Pier 39 barge plus a westward angle to the Gate. The ~20m rise beats sea-level Marina Green against incoming fog, and it is far less mobbed.',
    recurring: false,
  },
  {
    id: 'evt-sf-jul4-marina-green',
    city: 'sf',
    name: 'Marina Green',
    tagline: 'Best angle on the bridge, worst odds against Karl.',
    category: 'fireworks',
    lat: 37.8065, lng: -122.4370,
    spotId: 'sf-marina-green',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'Head-on to the Golden Gate Bridge display, but sea level right at the mouth of the Gate makes it the first place the fog swallows. Great when clear, heartbreak when not.',
    recurring: false,
    note: 'Dress warm. This is ground zero for the evening fog.',
  },
  {
    id: 'evt-sf-jul4-aquatic-park',
    city: 'sf',
    name: 'Aquatic Park',
    tagline: 'Front row at the barge. Karl likes the front row too.',
    category: 'fireworks',
    lat: 37.8067, lng: -122.4225,
    spotId: 'sf-aquatic-park',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'Official public viewing area at the epicenter of the Pier 39 show. Closest, loudest, most electric, and the most fog-exposed at sea level. Heavy crowds and street closures.',
    recurring: false,
    note: 'Public viewing zone. Take transit, roads north of Bay St close by ~4pm.',
  },
  {
    id: 'evt-sf-jul4-treasure-island',
    city: 'sf',
    name: 'Treasure Island Viewpoint',
    tagline: 'Dead center of the bay. Both barges on one horizon.',
    category: 'fireworks',
    lat: 37.8197, lng: -122.3700,
    spotId: 'sf-treasure-island',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'Mid-bay vantage that catches both the Pier 39 barge and the Golden Gate display at once, with the skyline between them. Often clearer than the SF shoreline.',
    recurring: false,
    note: 'Closed to cars for non-residents this year. Take the 25 Muni, the ferry, or bike in.',
  },
  {
    id: 'evt-sf-jul4-grizzly-peak',
    city: 'sf',
    name: 'Grizzly Peak',
    tagline: 'Too far east for Karl. The whole bay show, fog-free.',
    category: 'fireworks',
    lat: 37.8800, lng: -122.2430,
    spotId: 'sf-grizzly-peak',
    startDate: '2026-07-04', endDate: '2026-07-04',
    activeHoursStart: '21:00', activeHoursEnd: '22:30',
    description: 'From the East Bay hills the entire display reads at once, bridge and barge, usually well clear of the fog that plagues the SF shoreline. Distant, but the panorama is the trade.',
    recurring: false,
    note: 'Roadside pullouts fill early. No facilities.',
  },
];

/** Returns events that are active right now or today. */
export function getActiveEvents(now: Date = new Date(), city?: City): CuratedEvent[] {
  return getEventsAtHour(now, city);
}

/**
 * Events visible on the map at a specific instant. Used by the Unified Timeline
 * scrubber to gate pins to the selected hour — e.g. the July 4 fireworks pins
 * only surface at the 21:00–22:30 window on 2026-07-04. Local date/time.
 */
export function getEventsAtHour(at: Date = new Date(), city?: City): CuratedEvent[] {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return curatedEvents.filter((evt) => {
    if (city && evt.city !== city) return false;
    if (today < evt.startDate || today > evt.endDate) return false;
    if (evt.activeHoursStart && evt.activeHoursEnd) {
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
export function getTodaysEvents(now: Date = new Date(), city?: City): CuratedEvent[] {
  const today = now.toISOString().slice(0, 10);
  return curatedEvents.filter(
    (evt) => (!city || evt.city === city) && today >= evt.startDate && today <= evt.endDate,
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

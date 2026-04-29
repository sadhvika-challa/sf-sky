// Coarse SF land outline — used to clip the weather-mode heatmap so the
// gradient never bleeds into the bay or ocean. Coordinates are
// [latitude, longitude], traced clockwise starting at the NW tip
// (Sutro Heights / Cliff House).
//
// Resolution intentionally kept low (~25 vertices). The mask is drawn into
// a small canvas with a slight blur, so the rendered coastline ends up
// soft-edged rather than tracking every actual cove. That's the right
// fidelity for a heatmap: precise enough to read as "SF", forgiving enough
// to absorb the IDW halo that extends slightly past each anchor.
//
// Coastal vertices intentionally sit a few hundred meters *offshore* of
// the legal shoreline. The visible city includes piers, Embarcadero
// promenade, Crissy Field, the Hunters Point peninsula, and the Ocean
// Beach surf line — all of which read as "SF" on the basemap and need
// gradient coverage. Tracing the legal coast leaves these edges bare; an
// offshore trace + soft blur gives the IDW raster room to fill the
// visible footprint edge-to-edge.

export const SF_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  // West coast (Pacific) — pushed offshore so the surf line reads as
  // covered land instead of getting eaten by the mask edge.
  [37.7830, -122.5170], // Sutro Heights / Lands End — out into the Pacific
  [37.7920, -122.5050], // China Beach
  [37.7995, -122.4900], // Baker Beach

  // North coast (Golden Gate -> Embarcadero) — pushed into the channel so
  // Crissy Field, Marina Green, Aquatic Park breakwater, and the
  // Fisherman's Wharf piers all sit inside the mask.
  [37.8125, -122.4750], // Presidio shoreline / Crissy Field beach
  [37.8160, -122.4500], // Marina yacht harbor breakwater
  [37.8170, -122.4250], // Fort Mason / Aquatic Park breakwater
  [37.8160, -122.4050], // Pier 39 / Fisherman's Wharf piers
  [37.8090, -122.3900], // Piers 27-35 (cruise terminal apron)

  // East coast (Embarcadero -> Hunters Point) — pushed past the pier
  // bulkheads so the entire Embarcadero, Mission Bay waterfront, Pier 70,
  // and Islais Creek industrial edge are all covered.
  [37.7975, -122.3795], // Ferry Building / Pier 14 breakwater
  [37.7855, -122.3760], // Bay Bridge anchorage / Rincon waterfront
  [37.7740, -122.3760], // Mission Bay / Chase Center waterfront
  [37.7615, -122.3755], // Mission Rock / Pier 70 north
  [37.7475, -122.3680], // Pier 80 / Islais Creek mouth

  // Hunters Point peninsula — the tip extends far east into the bay, so
  // we wrap around it explicitly. Without these the entire SE corner of
  // the city falls outside the mask.
  [37.7355, -122.3530], // Hunters Point peninsula tip (HPNS pier)
  [37.7240, -122.3580], // Hunters Point south / India Basin
  [37.7165, -122.3700], // Heron's Head / Yosemite Slough
  [37.7095, -122.3770], // Candlestick Point — out past the old stadium pad

  // South county line — straight east-west cut along the SF/San Mateo
  // border. Slightly south of the legal line to avoid trimming Visitacion
  // Valley's southern blocks.
  [37.7060, -122.4060], // South county line (east)
  [37.7060, -122.4555], // Daly City line mid
  [37.7160, -122.4960], // SF State / Lake Merced south
  [37.7270, -122.5040], // Fort Funston bluffs

  // West coast returning north — offshore of the Great Highway so the
  // entire Sunset/Richmond beach edge reads as covered.
  [37.7500, -122.5135], // Ocean Beach south
  [37.7700, -122.5145], // Ocean Beach north
  [37.7830, -122.5170], // Back to Sutro Heights / Lands End
];

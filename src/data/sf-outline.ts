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

export const SF_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [37.7795, -122.5135], // Sutro Heights / Cliff House
  [37.7900, -122.4985], // China Beach
  [37.7950, -122.4830], // Baker Beach
  [37.8050, -122.4700], // Crissy Field
  [37.8085, -122.4500], // Marina yacht harbor
  [37.8090, -122.4250], // Aquatic Park
  [37.8095, -122.4070], // Pier 39 / Embarcadero N
  [37.7950, -122.3915], // Ferry Building
  [37.7833, -122.3880], // Rincon Hill
  [37.7745, -122.3870], // Mission Bay
  [37.7600, -122.3850], // Mission Rock
  [37.7475, -122.3825], // Indian Basin
  [37.7340, -122.3690], // Hunters Point E
  [37.7200, -122.3760], // Heron's Head south
  [37.7115, -122.3835], // Candlestick
  [37.7080, -122.4060], // South county line (east)
  [37.7080, -122.4555], // Daly City line mid
  [37.7180, -122.4945], // SF State / Lake Merced south
  [37.7275, -122.5010], // Fort Funston
  [37.7500, -122.5104], // Ocean Beach south
  [37.7700, -122.5108], // Ocean Beach north
  [37.7795, -122.5135], // back to Sutro Heights
];

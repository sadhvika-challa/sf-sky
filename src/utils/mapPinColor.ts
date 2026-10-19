const TEXT_STOPS = [
  { score: 0, color: [158, 72, 85] },
  { score: 30, color: [155, 93, 49] },
  { score: 50, color: [143, 112, 35] },
  { score: 70, color: [72, 123, 63] },
  { score: 90, color: [47, 117, 83] },
  { score: 100, color: [47, 117, 83] },
];

const PIN_STOPS = [
  { score: 0, color: [237, 214, 221] },
  { score: 20, color: [237, 214, 221] },
  { score: 40, color: [230, 209, 175] },
  { score: 55, color: [240, 218, 143] },
  { score: 60, color: [173, 219, 178] },
  { score: 70, color: [146, 203, 164] },
  { score: 80, color: [37, 132, 84] },
  { score: 100, color: [7, 95, 59] },
];

export const MAP_PIN_INK = '#153D35';

function interpolateScoreColor(score: number, stops: typeof PIN_STOPS): string {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const upper = stops.findIndex((stop) => stop.score >= value);
  if (upper <= 0) return `rgb(${stops[0].color.join(', ')})`;
  const start = stops[upper - 1];
  const end = stops[upper];
  const fraction = (value - start.score) / (end.score - start.score);
  return `rgb(${start.color.map((channel, index) => Math.round(channel + (end.color[index] - channel) * fraction)).join(', ')})`;
}

/** Highest scores carry the deepest green; lower scores recede on the map. */
export function getMapPinColor(score: number): string {
  if (!Number.isFinite(score)) return 'rgb(232, 238, 240)';
  return interpolateScoreColor(score, PIN_STOPS);
}

export function getScoreTextColor(score: number): string {
  if (!Number.isFinite(score)) return 'rgb(107, 114, 128)';
  return interpolateScoreColor(score, TEXT_STOPS);
}

function luminance(channels: number[]): number {
  const linear = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Contrast can cross a threshold between the light and dark score fills. */
export function getMapPinTextColor(score: number): string {
  const fill = luminance(getMapPinColor(score).match(/\d+/g)!.map(Number));
  if (1.05 / (fill + 0.05) >= 4.5) return '#FFFFFF';
  if ((fill + 0.05) / (luminance([21, 61, 53]) + 0.05) >= 4.5) return MAP_PIN_INK;
  return '#000000';
}

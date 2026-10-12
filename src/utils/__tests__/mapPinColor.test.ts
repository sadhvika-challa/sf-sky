import { describe, expect, it } from 'vitest';
import { getMapPinColor, getMapPinTextColor, getScoreTextColor } from '../mapPinColor';

function luminance(rgb: number[]) {
  const channels = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe('map pin legibility', () => {
  it('keeps numbers readable across light and dark fills throughout the score range', () => {
    for (let score = 0; score <= 100; score += 1) {
      const rgb = getMapPinColor(score).match(/\d+/g)!.map(Number);
      const hex = getMapPinTextColor(score).slice(1);
      const foreground = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
      const light = Math.max(luminance(rgb), luminance(foreground));
      const dark = Math.min(luminance(rgb), luminance(foreground));
      expect((light + 0.05) / (dark + 0.05), `score ${score}`).toBeGreaterThanOrEqual(4.5);
      const ink = getScoreTextColor(score).match(/\d+/g)!.map(Number);
      expect(1.05 / (luminance(ink) + 0.05), `score on white ${score}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('makes good and exceptional scores progressively darker rather than equally bright', () => {
    const lightness = (score: number) => luminance(getMapPinColor(score).match(/\d+/g)!.map(Number));
    for (let score = 60; score < 100; score += 1) expect(lightness(score + 1)).toBeLessThan(lightness(score));
    expect(getMapPinTextColor(95)).toBe('#FFFFFF');
  });
});

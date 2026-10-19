import { describe, expect, it } from 'vitest';
import { selectForecastTargets } from '../forecastTargets';
import type { Spot } from '../../data/spots';
import { getMapPinColor } from '../mapPinColor';
import { formatScoreValue } from '../confidence';

const spots = [{ id: 'one', lat: 1, lng: 1 }, { id: 'two', lat: 2, lng: 2 },
  { id: 'outside', lat: 10, lng: 10 }, { id: 'private', lat: 1.5, lng: 1.5, visibility: 'private' }] as Spot[];
describe('point forecast demand', () => {
  it('requests every visible spot, including private spots, with the selected spot first', () => {
    expect(selectForecastTargets(spots, { north: 2, south: 1, west: 1, east: 2 }, 'outside', 'regional', ['one']))
      .toEqual(['outside', 'regional', 'one', 'two', 'private']);
  });
  it('does not request the entire catalog before map bounds are available', () => {
    expect(selectForecastTargets(spots, null, 'one', 'regional')).toEqual(['one', 'regional']);
  });
  it('changes targets when the map moves, independently of the selected hour', () => {
    expect(selectForecastTargets(spots, { north: 11, south: 9, east: 11, west: 9 }, undefined, 'regional'))
      .toEqual(['regional', 'outside']);
  });
  it('keeps missing data visually distinct from a valid zero', () => {
    expect(formatScoreValue(NaN)).toBe('--');
    expect(formatScoreValue(0)).toBe('0');
    expect(getMapPinColor(NaN)).not.toBe(getMapPinColor(0));
  });
});

import { describe, test, expect } from 'vitest';
import { computeCityOutlook, outlookMessage, statusLabel } from '../outlook';
import type { LiveScoresMap, LiveSpotScores } from '../../hooks/useLiveScores';

function makeScoresMap(entries: [string, Partial<LiveSpotScores>][]): LiveScoresMap {
  const map: LiveScoresMap = new Map();
  for (const [id, partial] of entries) {
    map.set(id, {
      sunrise: 50, sunset: 50, stargazing: 50, isLive: true,
      ...partial,
    });
  }
  return map;
}

describe('computeCityOutlook', () => {
  test('good outlook when top spots score high', () => {
    const scores = makeScoresMap([
      ['a', { sunset: 85 }],
      ['b', { sunset: 80 }],
    ]);
    const outlook = computeCityOutlook(scores);
    expect(outlook.sunset.status).toBe('good');
  });

  test('poor outlook when all scores are low', () => {
    const scores = makeScoresMap([
      ['a', { sunset: 30 }],
      ['b', { sunset: 25 }],
    ]);
    const outlook = computeCityOutlook(scores);
    expect(outlook.sunset.status).toBe('poor');
  });

  test('isLive is false when no live scores', () => {
    const scores: LiveScoresMap = new Map();
    scores.set('a', { sunrise: 50, sunset: 50, stargazing: 50, isLive: false });
    expect(computeCityOutlook(scores).isLive).toBe(false);
  });
});

describe('outlookMessage', () => {
  test('SF good sunset mentions Karl', () => {
    const msg = outlookMessage('sunset', 'good', 'sf');
    expect(msg.toLowerCase()).toContain('karl');
  });

  test('Austin good sunset does not mention Karl', () => {
    const msg = outlookMessage('sunset', 'good', 'austin');
    expect(msg.toLowerCase()).not.toContain('karl');
  });
});

describe('statusLabel', () => {
  test('SF good is Karl-Free', () => expect(statusLabel('good', 'sf')).toBe('Karl-Free'));
  test('Austin good is Clear Skies', () => expect(statusLabel('good', 'austin')).toBe('Clear Skies'));
  test('SF poor is Karl Wins', () => expect(statusLabel('poor', 'sf')).toBe('Karl Wins'));
});

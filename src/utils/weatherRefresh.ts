export const WEATHER_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Schedule from evidence completion, never from hook mount. Successful
 * responses use their fetch timestamp. Failures use the completed attempt so
 * retry cadence cannot collapse into a tight loop.
 */
export function nextWeatherRefreshAt(
  fetchedAt: number | null,
  completedAt = Date.now(),
): number {
  const anchor = fetchedAt !== null && Number.isFinite(fetchedAt)
    ? fetchedAt
    : completedAt;
  return anchor + WEATHER_REFRESH_INTERVAL_MS;
}

export function keepRefreshScheduleForScope<T extends { scope: string }>(
  schedule: T | null,
  activeScope: string,
): T | null {
  return schedule?.scope === activeScope ? schedule : null;
}

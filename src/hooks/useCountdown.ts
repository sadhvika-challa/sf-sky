import { useEffect, useState } from 'react';

export interface CountdownResult {
  /** Human-readable label like "1h 23m" or "12m" or "Now" */
  label: string;
  /** Minutes remaining (negative = past) */
  minutesLeft: number;
  /** Urgency tier for color styling */
  urgency: 'normal' | 'soon' | 'imminent' | 'now';
}

/**
 * Live countdown to a future Date. Updates every 60 seconds.
 * Returns a human-readable label and urgency tier.
 */
export function useCountdown(target: Date): CountdownResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick every 60 seconds
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (Number.isNaN(target.getTime())) {
    return { label: '—', minutesLeft: 0, urgency: 'normal' };
  }

  const diffMs = target.getTime() - now;
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin <= 0) {
    return { label: 'Now', minutesLeft: diffMin, urgency: 'now' };
  }

  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;

  let label: string;
  if (hours > 0) {
    label = `${hours}h ${mins}m`;
  } else {
    label = `${mins}m`;
  }

  let urgency: CountdownResult['urgency'];
  if (diffMin <= 10) {
    urgency = 'imminent';
  } else if (diffMin <= 30) {
    urgency = 'soon';
  } else {
    urgency = 'normal';
  }

  return { label, minutesLeft: diffMin, urgency };
}

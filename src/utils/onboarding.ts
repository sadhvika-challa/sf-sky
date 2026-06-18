/**
 * First-visit onboarding flag storage. Each key gates a single one-time
 * prompt (welcome card or contextual hint). The `v2` prefix lets us bump
 * the version after major UX changes to re-trigger onboarding for
 * existing users without clobbering unrelated localStorage keys.
 */
export const ONBOARDING_KEYS = {
  welcome: 'onboarding:v2:welcome',
  tapSpot: 'onboarding:v2:tap-spot',
  scrollCards: 'onboarding:v2:scroll-cards',
  weatherOverlay: 'onboarding:v2:weather-overlay',
  metrics: 'onboarding:v2:metrics',
  scrubTimeline: 'onboarding:v2:scrub-timeline',
  complete: 'onboarding:v2:complete',
} as const;

export type OnboardingKey = (typeof ONBOARDING_KEYS)[keyof typeof ONBOARDING_KEYS];

/**
 * Treats unavailable storage (SSR, Safari private mode, quota errors) as
 * "already done" so we never block the UI on a transient localStorage
 * failure or repeatedly try to write a flag that won't stick.
 */
export function isOnboardingDone(key: OnboardingKey): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingDone(key: OnboardingKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Storage disabled / quota exceeded — non-fatal.
  }
}

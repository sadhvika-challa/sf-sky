/**
 * First-visit onboarding flag storage. Each key gates a single one-time
 * prompt (welcome card or contextual hint). The `v1` prefix lets us bump
 * the version after major UX changes to re-trigger onboarding for
 * existing users without clobbering unrelated localStorage keys.
 */
export const ONBOARDING_KEYS = {
  welcome: 'onboarding:v1:welcome',
  tapSpot: 'onboarding:v1:tap-spot',
  scrollCards: 'onboarding:v1:scroll-cards',
  weatherMode: 'onboarding:v1:weather-mode',
  metrics: 'onboarding:v1:metrics',
  scrubTimeline: 'onboarding:v1:scrub-timeline',
  complete: 'onboarding:v1:complete',
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

import { useState, useCallback } from 'react';
import type { MapPoint } from '../components/MapView';
import type { WeatherMetric } from '../utils/interpolate';
import {
  ONBOARDING_KEYS,
  isOnboardingDone,
  markOnboardingDone,
} from '../utils/onboarding';

export function useOnboarding() {
  // Onboarding: welcome card on first load, then a chain of one-time
  // hints tied to specific interactions. Each step is gated by a
  // localStorage flag (see `utils/onboarding.ts`); the component-level
  // state below tracks the in-session "is this currently visible"
  // question. Order roughly mirrors the natural usage path:
  //   welcome → tap-spot → scroll-cards → weather-mode →
  //   metrics + scrub-timeline → complete
  const [showWelcome, setShowWelcome] = useState(
    () => !isOnboardingDone(ONBOARDING_KEYS.welcome),
  );
  const [showTapSpotHint, setShowTapSpotHint] = useState(false);
  // Pixel position of the pin we anchor the tap-spot hint to. Driven
  // by MapView's `TapSpotAnchorTracker` so the hint follows the chosen
  // pin as the user pans/zooms while the hint is up.
  const [tapSpotAnchor, setTapSpotAnchor] = useState<MapPoint | null>(null);
  const [showScrollCardsHint, setShowScrollCardsHint] = useState(false);
  const [showWeatherModeHint, setShowWeatherModeHint] = useState(false);
  const [showMetricsHint, setShowMetricsHint] = useState(false);
  const [showScrubHint, setShowScrubHint] = useState(false);
  const [showCompleteHint, setShowCompleteHint] = useState(false);

  // Onboarding dismissal handlers. Each writes the corresponding flag
  // so the prompt never reappears across sessions.
  const handleDismissWelcome = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.welcome);
    setShowWelcome(false);
    // Hand off to the tap-spot hint immediately, but only when this is a
    // genuine first-visit chain — if the user has already tapped a pin
    // in some prior session, skip it entirely.
    if (!isOnboardingDone(ONBOARDING_KEYS.tapSpot)) {
      setShowTapSpotHint(true);
    }
  }, []);

  const handleDismissTapSpotHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.tapSpot);
    setShowTapSpotHint(false);
  }, []);

  const handleDismissScrollCardsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  // Card swipe inside the score panel — first time the user swipes
  // between cards, treat the scroll-cards hint as "got it" and put it
  // away. Tapping the hint or closing the panel are the two other
  // exit paths; this one is the most natural.
  const handleScorePanelCardSwipe = useCallback(() => {
    if (isOnboardingDone(ONBOARDING_KEYS.scrollCards)) return;
    markOnboardingDone(ONBOARDING_KEYS.scrollCards);
    setShowScrollCardsHint(false);
  }, []);

  const handleDismissWeatherModeHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.weatherMode);
    setShowWeatherModeHint(false);
  }, []);

  const handleDismissMetricsHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.metrics);
    setShowMetricsHint(false);
  }, []);

  const handleDismissScrubHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
    setShowScrubHint(false);
  }, []);

  const handleDismissCompleteHint = useCallback(() => {
    markOnboardingDone(ONBOARDING_KEYS.complete);
    setShowCompleteHint(false);
  }, []);

  // Wrap the metric setter so picking any metric (temp / clouds /
  // precip / wind / fog) auto-dismisses the metrics hint.
  const wrapMetricChange = useCallback(
    (setter: (metric: WeatherMetric) => void) =>
      (metric: WeatherMetric) => {
        setter(metric);
        if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
          markOnboardingDone(ONBOARDING_KEYS.metrics);
          setShowMetricsHint(false);
        }
      },
    [],
  );

  // Wrap the scrubber callback so any user-driven hour change auto-
  // dismisses the scrub-timeline hint AND fires the final "enjoy" hint
  // (the wrap-up of the onboarding flow). The "default to now" effect
  // calls `setWeatherHourKey` directly, so it doesn't fire this path
  // and won't accidentally dismiss / advance before the user actually
  // touches the slider.
  const wrapHourChange = useCallback(
    (setter: (key: string) => void) =>
      (key: string) => {
        setter(key);
        if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
          markOnboardingDone(ONBOARDING_KEYS.scrubTimeline);
          setShowScrubHint(false);
          // Final step: only show the wrap-up if the user actually got
          // here through the onboarding flow (i.e. they hadn't already
          // completed it on a previous session).
          if (!isOnboardingDone(ONBOARDING_KEYS.complete)) {
            setShowCompleteHint(true);
          }
        }
      },
    [],
  );

  // Onboarding side-effects that other handlers in App need to call.
  // These are the onboarding-related transitions that happen when
  // switching modes, selecting spots, or dismissing panels.

  /** Called when entering weather mode — marks weather hint done, surfaces metrics + scrub hints. */
  const onEnterWeatherMode = useCallback(() => {
    if (!isOnboardingDone(ONBOARDING_KEYS.weatherMode)) {
      markOnboardingDone(ONBOARDING_KEYS.weatherMode);
      setShowWeatherModeHint(false);
    }
    if (!isOnboardingDone(ONBOARDING_KEYS.metrics)) {
      setShowMetricsHint(true);
    }
    if (!isOnboardingDone(ONBOARDING_KEYS.scrubTimeline)) {
      setShowScrubHint(true);
    }
  }, []);

  /** Called when leaving weather mode — hides weather-only hints. */
  const onLeaveWeatherMode = useCallback(() => {
    setShowMetricsHint(false);
    setShowScrubHint(false);
    setShowCompleteHint(false);
  }, []);

  /** Called when a spot is selected (non-null). */
  const onSpotSelected = useCallback(() => {
    if (!isOnboardingDone(ONBOARDING_KEYS.tapSpot)) {
      markOnboardingDone(ONBOARDING_KEYS.tapSpot);
      setShowTapSpotHint(false);
    }
    if (!isOnboardingDone(ONBOARDING_KEYS.scrollCards)) {
      setShowScrollCardsHint(true);
    }
  }, []);

  /** Called when a spot is deselected (panel dismissed). */
  const onSpotDeselected = useCallback(() => {
    if (!isOnboardingDone(ONBOARDING_KEYS.weatherMode)) {
      setShowWeatherModeHint(true);
    }
    setShowScrollCardsHint(false);
  }, []);

  return {
    // State
    showWelcome,
    showTapSpotHint,
    tapSpotAnchor,
    showScrollCardsHint,
    showWeatherModeHint,
    showMetricsHint,
    showScrubHint,
    showCompleteHint,

    // State setters needed by parent
    setTapSpotAnchor,

    // Dismissal handlers
    handleDismissWelcome,
    handleDismissTapSpotHint,
    handleDismissScrollCardsHint,
    handleDismissWeatherModeHint,
    handleDismissMetricsHint,
    handleDismissScrubHint,
    handleDismissCompleteHint,
    handleScorePanelCardSwipe,

    // Wrapper factories
    wrapMetricChange,
    wrapHourChange,

    // Mode/selection callbacks
    onEnterWeatherMode,
    onLeaveWeatherMode,
    onSpotSelected,
    onSpotDeselected,
  };
}

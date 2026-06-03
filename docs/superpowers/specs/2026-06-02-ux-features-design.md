# SF Sky — UX Quick Wins (Best Now Pill, Countdown, Smart Search)

**Date:** 2026-06-02
**Status:** Design approved
**Branch:** `feat/ux-quick-wins`
**UI/UX:** Additive features only — no visual redesign

---

## 1. "Best Right Now" Floating Pill

Floating pill at bottom of explore mode showing the highest-scoring spot for the soonest upcoming event. Auto-detects event type by time of day (sunset in evening, sunrise in morning, stargazing late night).

- Displays: event type label + spot name + score number (tinted by tier color)
- Tapping opens ScorePanel for that spot
- Hidden when: ScorePanel open, search open, weather mode active
- Cream bg pill matching existing aesthetic, ≥44px touch target
- Fade + slide-up entrance, 200ms ease-out

**Files:** New `src/components/BestNowPill.tsx`, modify `src/App.tsx`

## 2. Countdown Timer on Score Cards

Live countdown ("Sunset in 1h 23m") on each score card header.

- Updates every 60 seconds
- Color: default gray → amber < 30min → red-ish < 10min
- font-mono tabular-nums so digits don't jump
- Past events show "Now" or switch to next occurrence

**Files:** New `src/hooks/useCountdown.ts`, modify `src/components/ScoreCard.tsx`

## 3. Smart Search Ordering

Search results sorted by score (best first) instead of alphabetical.

- Primary: live score for soonest event (descending)
- Secondary: distance from user (ascending) if geolocation available
- Fuzzy name filtering still applies first — this only changes sort order

**Files:** Modify `src/components/SearchOverlay.tsx`

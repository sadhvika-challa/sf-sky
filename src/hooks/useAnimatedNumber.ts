import { useEffect, useRef, useState } from 'react';

/**
 * Smoothly animate a numeric value toward `target` over `durationMs`.
 *
 * Used by the weather labels to roll temperature / wind / precip values
 * (odometer-style) instead of snapping when the time scrubber moves. Each
 * new `target` cancels the in-flight animation and starts a fresh one
 * from the current displayed value, so rapid scrubbing reads as
 * continuous motion rather than a strobe of half-finished tweens.
 *
 * Non-finite targets short-circuit to that value (so the formatter
 * upstream can render "–"). All ref writes are confined to effects to
 * satisfy React 19's `react-hooks/refs` rule, which forbids ref access
 * during render.
 */
export function useAnimatedNumber(target: number, durationMs = 200): number {
  const [display, setDisplay] = useState(target);

  // Mirror of `display` that the animation effect reads as the start of
  // the next tween. Updated in its own effect so we never read or write
  // a ref during render.
  const displayRef = useRef(display);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  // Animation bookkeeping lives entirely inside the effect — no render-
  // phase ref access. The rAF id is stored here so the cleanup can
  // cancel an in-flight tween before starting a new one.
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    // Non-finite targets skip the animation entirely — we bypass the
    // `display` state below and return `target` straight to the caller,
    // so there's no need to write state from inside this effect.
    if (!Number.isFinite(target)) return;

    const start = Number.isFinite(displayRef.current) ? displayRef.current : target;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic — matches the brief's overall transition feel and
      // lets the digit "settle" softly rather than coasting past the value.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (target - start) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, durationMs]);

  // Pass-through for non-finite targets — see the early return in the
  // animation effect for the rationale.
  if (!Number.isFinite(target)) return target;
  return display;
}

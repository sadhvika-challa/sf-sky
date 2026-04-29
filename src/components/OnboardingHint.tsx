import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

/**
 * Arrow doodle layout per hint. We deliberately keep the set small
 * (one per hint in the flow) so we don't end up with a half-finished
 * art kit:
 *   - 'up'        tap-spot       (text low, points up at a pin)
 *   - 'down'      scrub-timeline (text above scrubber, points down)
 *   - 'to-cloud'  weather-mode   (long arrow up onto the cloud icon)
 *   - 'swipe'     scroll-cards   (single right-pointing swipe arrow)
 *   - 'none'      complete       (final wrap-up, no pointing needed)
 */
export type HintArrowDirection = 'up' | 'down' | 'to-cloud' | 'swipe' | 'none';

interface OnboardingHintProps {
  message: string;
  /** Tailwind classes that anchor the hint within the app viewport. */
  positionClassName?: string;
  /**
   * Inline style override — used when the hint is anchored to a moving
   * UI element (currently just the tap-spot pin) and needs `top`/`left`
   * pixel values that change over time.
   */
  style?: CSSProperties;
  arrow: HintArrowDirection;
  onDismiss: () => void;
  /** Optional aria-label override; defaults to the message + dismiss hint. */
  ariaLabel?: string;
  /**
   * If set, the hint auto-dismisses after this many ms. Used by the
   * final "enjoy" hint so it fades on its own without forcing the user
   * to tap one more time before they can play with the map.
   */
  autoDismissMs?: number;
}

const FADE_MS = 220;

/**
 * One-time onboarding hint: handwritten black text floating over the
 * map with a small hand-drawn arrow pointing at the relevant UI
 * element.
 *
 * Important structural detail: the arrow SVG sits *outside* the
 * clickable `<button>` (and is `pointer-events: none`), so taps that
 * land on the arrow's visual area fall through to whatever UI is
 * underneath — the toggle, a pin, the scrubber, etc. Only the text
 * (and its cream aura) is hit-targetable for tap-to-dismiss. Without
 * this split the cloud icon under the to-cloud arrow would eat the
 * first click as a hint-dismiss and require a second tap to actually
 * switch modes.
 */
export default function OnboardingHint({
  message,
  positionClassName,
  style,
  arrow,
  onDismiss,
  ariaLabel,
  autoDismissMs,
}: OnboardingHintProps) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Tap-to-dismiss and auto-dismiss share this exit path so the fade
  // animation always plays before the parent unmounts us.
  const beginExit = () => {
    setExiting((prev) => {
      if (prev) return prev;
      window.setTimeout(onDismiss, FADE_MS);
      return true;
    });
  };

  useEffect(() => {
    if (!autoDismissMs) return;
    const id = window.setTimeout(beginExit, autoDismissMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDismissMs]);

  const visible = mounted && !exiting;

  // Layout depends on where the arrow lives relative to the text.
  // 'to-cloud' uses items-start so the arrow's left edge can be
  // pixel-anchored to the cloud icon independent of how the text wraps
  // below it. Everything else centers around the text.
  const layout = arrow === 'to-cloud' ? 'flex-col items-start' : 'flex-col items-center';

  // Soft cream halo around the text so it stays readable over busy map
  // tiles (parks, dense streets, dark water) without us drawing a pill.
  const textShadow =
    '0 0 6px rgba(253,248,240,0.95), 0 0 12px rgba(253,248,240,0.85), 0 1px 0 rgba(253,248,240,0.95)';

  return (
    <div
      className={`pointer-events-none absolute z-40 flex ${layout} transition-opacity ease-out ${positionClassName ?? ''}`}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {arrow === 'up' && <ArrowUp />}
      {arrow === 'to-cloud' && <ArrowToCloud />}

      <button
        type="button"
        onClick={beginExit}
        aria-label={ariaLabel ?? `Tip: ${message}. Tap to dismiss.`}
        className="pointer-events-auto relative isolate cursor-pointer"
      >
        {/* Soft cream aura behind the text. The text-shadow halo on
            the label alone isn't enough on busy map tiles, so we paint
            a radial cream wash and let it dissolve into nothing well
            inside the box — no edge ever reaches a hard boundary, so
            it reads as a circular glow that bleeds into the map.
            Knobs that matter:
              - `circle` (not `ellipse`) keeps the falloff perfectly
                round regardless of how wide the text wraps.
              - The 78% transparent stop ensures the gradient is fully
                invisible *before* the box edges, so there's no
                rectangular outline.
              - `-m-9` makes the aura's box noticeably larger than the
                text so the gradient has room to fade.
              - `filter: blur(3px)` smooths any remaining banding so
                the falloff blends into the background.
            `isolate` on the parent creates a local stacking context so
            this `-z-10` element sits cleanly behind the label without
            leaking elsewhere. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -m-9 -z-10"
          style={{
            background:
              'radial-gradient(circle at center, rgba(253,248,240,0.92) 0%, rgba(253,248,240,0.72) 28%, rgba(253,248,240,0.3) 55%, rgba(253,248,240,0) 78%)',
            filter: 'blur(3px)',
          }}
        />
        <span
          className={`block font-handwritten font-semibold text-[#1a1a18] text-[21px] leading-[1.15] max-w-[16rem] ${
            arrow === 'to-cloud' ? 'text-left' : 'text-center'
          }`}
          style={{ textShadow }}
        >
          {message}
        </span>
      </button>

      {arrow === 'down' && <ArrowDown />}
      {arrow === 'swipe' && <ArrowSwipe />}
    </div>
  );
}

/* ─── Hand-drawn arrow doodles ──────────────────────────────────────── */

const ARROW_STROKE = '#1a1a18';
// Arrow doodles all set `pointerEvents: none` so taps that land on the
// arrow region fall through to underlying UI (the toggle, a pin, etc.)
// rather than being eaten by the hint as a dismiss tap.
const ARROW_STYLE: CSSProperties = {
  filter:
    'drop-shadow(0 0 4px rgba(253,248,240,0.9)) drop-shadow(0 0 8px rgba(253,248,240,0.7))',
  pointerEvents: 'none',
};

/**
 * Arrow that sits *above* the text and points up — used by the tap-spot
 * hint to gesture into the map area where the pins are.
 */
function ArrowUp() {
  return (
    <svg
      width="34"
      height="46"
      viewBox="0 0 34 46"
      fill="none"
      stroke={ARROW_STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="-mb-1"
      style={ARROW_STYLE}
    >
      {/* Slight S-curve so it feels drawn by hand, not generated. */}
      <path d="M17 42 C 24 32, 10 22, 17 6" />
      <path d="M11 12 L 17 6 L 23 12" />
    </svg>
  );
}

/** Mirror of ArrowUp — sits *below* the text and points down. */
function ArrowDown() {
  return (
    <svg
      width="34"
      height="46"
      viewBox="0 0 34 46"
      fill="none"
      stroke={ARROW_STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="-mt-1"
      style={ARROW_STYLE}
    >
      <path d="M17 4 C 24 14, 10 24, 17 40" />
      <path d="M11 34 L 17 40 L 23 34" />
    </svg>
  );
}

/**
 * Tall, slightly-curving arrow that reaches from text below the toggle
 * row up onto the cloud icon in the top-left mode toggle. The negative
 * top margin lets the arrow visually overlap the toggle area while the
 * text below it sits cleanly in the open map below.
 *
 * Geometry: tip at SVG (17, 6), so when the parent container is left-
 * positioned to align with the cloud icon (≈ left:3rem) the tip lands
 * right on the cloud regardless of how the text wraps.
 */
function ArrowToCloud() {
  return (
    <svg
      width="34"
      height="84"
      viewBox="0 0 34 84"
      fill="none"
      stroke={ARROW_STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ ...ARROW_STYLE, marginTop: '-44px', marginBottom: '-2px' }}
    >
      {/* Gentle S that bows slightly right then settles back onto the
          cloud — keeps the line from looking like a ruler-drawn pipe. */}
      <path d="M17 80 C 24 60, 10 32, 17 6" />
      <path d="M11 12 L 17 6 L 23 12" />
    </svg>
  );
}

/**
 * Single-direction "swipe" arrow used by the scroll-cards hint. Curves
 * gently from left to right with one arrowhead, suggesting horizontal
 * motion without the back-and-forth ambiguity of a double-headed
 * arrow.
 */
function ArrowSwipe() {
  return (
    <svg
      width="64"
      height="20"
      viewBox="0 0 64 20"
      fill="none"
      stroke={ARROW_STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-1"
      style={ARROW_STYLE}
    >
      {/* Slight wave from left edge to right arrowhead. */}
      <path d="M6 10 Q 22 3, 36 10 T 56 10" />
      <path d="M50 4 L 56 10 L 50 16" />
    </svg>
  );
}

/**
 * Hand-drawn scrubber icons for the hourly scroll strip. Each one is
 * deliberately a little imperfect — uneven rays, wavy horizons, lumpy clouds —
 * so they read like felt-tip sketches from a stationery shop rather than clean
 * geometric glyphs. All strokes use `currentColor` so the parent tints them via
 * Tailwind text color.
 */

interface IconProps {
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

/** Sun settling onto a gently waving horizon, a few uneven rays reaching up. */
export function SunsetIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* horizon — a soft wave, not a ruler line */}
      <path d="M2.5 17.5c2.5 0.6 4-0.8 6.5-0.4 2.8 0.5 4.3 1 7 0.3 1.6-0.4 3-0.1 4-0.2" />
      {/* half sun resting on the horizon */}
      <path d="M7.5 17.2c0.2-2.5 2.1-4.4 4.6-4.3 2.4 0.1 4.1 2.1 4.1 4.4" />
      {/* uneven rays */}
      <path d="M12 9.5V7" />
      <path d="M6.6 11.1 5.2 9.4" />
      <path d="M17.2 10.8 18.9 9.2" />
      <path d="M9 8.4 8.1 6.7" />
    </svg>
  );
}

/** Sun emerging from below — only the top arc shows, rays splay outward. */
export function SunriseIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* horizon with a faint curve */}
      <path d="M2.5 18c2.7 0.4 4.6 0.5 7.3 0.4 3.1-0.1 4.8-0.2 8-0.3 1-0 1.7 0 2.2 0.1" />
      {/* the very top of the sun peeking up */}
      <path d="M8 18c0.1-2.1 1.8-3.8 4.1-3.8 2.2 0 3.9 1.6 4 3.7" />
      {/* rays pointing up and out, slightly uneven */}
      <path d="M12 11.8V9.2" />
      <path d="M6.4 13 4.8 11.6" />
      <path d="M17.4 12.7 19.2 11.3" />
      <path d="M8.7 12 7.6 10.4" />
      <path d="M15.2 11.9 16.1 10.2" />
    </svg>
  );
}

/** A wobbly crescent moon with three scattered, hand-drawn asterisk stars. */
export function StargazingIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* crescent — two imperfect arcs that don't quite agree */}
      <path d="M15.6 4.6c-2.9-0.6-5.8 1.2-6.5 4.1-0.7 3 1.2 6 4.2 6.7 1.4 0.3 2.7 0.1 3.8-0.5-2.4 0.2-4.6-1.4-5.1-3.8-0.5-2.5 1-4.9 3.4-5.6 0.1-0.3 0.2-0.6 0.2-0.9z" />
      {/* star, top-right, with a tiny twinkle line */}
      <path d="M18.4 6.2v2.4M17.2 7.4h2.4" />
      <path d="M20 5.4l0.7 0.7" />
      {/* smaller star, mid-right */}
      <path d="M19.4 12.2v1.6M18.6 13h1.6" />
      {/* tiny star, lower-left */}
      <path d="M6.2 15.4v1.3M5.6 16h1.3" />
    </svg>
  );
}

/** A stubby-rayed sun half-tucked behind a lumpy cloud rolling in lower-right. */
export function NowIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* sun body, upper-left */}
      <circle cx="9.5" cy="9" r="3.1" />
      {/* short stubby rays above the cloud */}
      <path d="M9.5 3.6v1.4" />
      <path d="M5.2 5 6.1 5.9" />
      <path d="M13.8 5 12.9 5.9" />
      <path d="M3.6 9.3H5" />
      {/* lumpy cloud drifting in from lower-right */}
      <path d="M9 19.4c-1.5 0-2.6-1.1-2.6-2.5 0-1.3 1-2.4 2.3-2.5 0.4-1.5 1.8-2.5 3.4-2.4 1.6 0.1 2.9 1.3 3.1 2.8 1.4 0 2.5 1.1 2.5 2.4 0 1.4-1.2 2.5-2.7 2.5z" />
    </svg>
  );
}

import { useEffect, useState } from 'react';

interface WelcomeCardProps {
  /** Called once the exit animation has completed. */
  onDismiss: () => void;
}

const FADE_MS = 260;

/**
 * First-visit welcome card. Uses the app's existing type system —
 * Source Serif 4 for the headline (matches the score-panel `<h2>`),
 * DM Sans for body and CTA — rather than the handwritten face we use
 * for the hints, so this lands as a "real" intro card rather than a
 * sketchy doodle. Soft cream wash behind the card keeps the map
 * legible-but-quiet without making the toggle row look broken behind a
 * dark glass scrim.
 */
export default function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const handleDismiss = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(onDismiss, FADE_MS);
  };

  const visible = mounted && !exiting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-card-headline"
    >
      <div
        className={`absolute inset-0 bg-cream/70 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-[22rem] rounded-[18px] bg-cream border border-black/[0.08] shadow-[0_18px_50px_rgba(26,26,24,0.16)] px-6 pt-6 pb-5 transition-all ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        <h2
          id="welcome-card-headline"
          className="font-serif text-[19px] font-semibold leading-tight text-gray-900 tracking-tight whitespace-nowrap"
        >
          Welcome to Soleil.
        </h2>
        <p className="mt-3 font-sans text-[14px] leading-[1.55] text-gray-700">
          169 spots across SF, Santa Cruz, and Austin — scored for
          sunrise, sunset, and stargazing based on live conditions.
          Tap a pin to see if it's worth the trip.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="group mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#1a1a18] py-3 px-5 hover:bg-black active:scale-[0.99] transition-[background-color,transform]"
        >
          <span className="font-sans font-medium text-cream text-[14px] leading-none">
            Show me the spots
          </span>
          <svg
            width="18"
            height="12"
            viewBox="0 0 18 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-cream transition-transform group-hover:translate-x-0.5"
          >
            <path d="M2 6 H 15" />
            <path d="M10 1.5 L 15 6 L 10 10.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

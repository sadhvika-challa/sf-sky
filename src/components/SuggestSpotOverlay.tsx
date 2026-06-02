import { useEffect, useRef, useState } from 'react';
import { submitSpotSuggestion } from '../utils/supabase';

interface SuggestSpotOverlayProps {
  open: boolean;
  onClose: () => void;
  /**
   * Pre-fill the spot name field. Used when the user got here from the
   * search overlay's empty state — their query becomes the suggested name.
   */
  initialName?: string;
}

const RECIPIENT = 'sadhvikac1@gmail.com';

function buildMailto(name: string, why: string): string {
  const subject = `Ask Karl — Spot suggestion: ${name}`;
  const body = [
    `Spot name: ${name}`,
    '',
    'Why it’s good:',
    why || '(none provided)',
  ].join('\n');
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export default function SuggestSpotOverlay({
  open,
  onClose,
  initialName = '',
}: SuggestSpotOverlayProps) {
  const [name, setName] = useState(initialName);
  const [why, setWhy] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Render-vs-mount split so the slide-out animation can play before
  // unmounting (mirrors SearchOverlay).
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setName('');
        setWhy('');
        setSubmitted(false);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  // Keep the name field in sync if the parent passes a fresh initial value
  // (e.g. user typed a new search query then opened suggest again).
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  useEffect(() => {
    if (!visible || submitted) return;
    const t = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [visible, submitted]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);
    const ok = await submitSpotSuggestion({
      name: trimmedName,
      location: '',
      notes: why.trim() || null,
      city: 'sf',
    });
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    } else {
      window.location.href = buildMailto(trimmedName, why.trim());
      setSubmitted(true);
    }
  }

  if (!mounted) return null;

  const canSubmit = name.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suggest a spot"
      className="fixed inset-0 z-[1100] bg-cream flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 pt-3 pb-3 bg-cream border-b border-cream-dark/60">
        <h2 className="font-serif text-base font-semibold text-gray-800">
          Know a spot Karl should check?
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-mono text-gray-600 hover:text-gray-800 active:text-gray-900 px-2 py-1 transition-colors"
        >
          {submitted ? 'Done' : 'Cancel'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {submitted ? (
          <div className="max-w-md mx-auto text-center pt-10">
            <p className="font-serif text-lg italic text-gray-700 leading-snug">
              Karl will review it. No promises — he's picky.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 text-[10px] tracking-[2px] uppercase font-mono text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto">
            <label className="block mb-4">
              <span className="block text-[10px] tracking-[2px] uppercase font-mono text-gray-500 mb-1.5">
                Spot name
              </span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Twin Peaks lower lot"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-10 px-3 text-sm font-mono bg-cream-dark/40 border border-cream-dark rounded-lg outline-none focus:border-gray-400 transition-colors placeholder:text-gray-400 text-gray-700"
              />
            </label>

            <label className="block mb-5">
              <span className="block text-[10px] tracking-[2px] uppercase font-mono text-gray-500 mb-1.5">
                Why it's good <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
              </span>
              <textarea
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                rows={5}
                placeholder="What makes this spot special for sunrise, sunset, or stargazing?"
                className="w-full px-3 py-2 text-sm font-mono bg-cream-dark/40 border border-cream-dark rounded-lg outline-none focus:border-gray-400 transition-colors placeholder:text-gray-400 text-gray-700 resize-y leading-relaxed"
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full h-11 rounded-lg bg-gray-700 text-cream font-mono text-[11px] tracking-[2px] uppercase transition-colors hover:bg-gray-800 active:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending...' : 'Send it to Karl'}
            </button>

            <p className="mt-3 text-[10px] font-mono text-gray-400 text-center leading-snug">
              Opens your email app. Karl reads them when fog permits.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

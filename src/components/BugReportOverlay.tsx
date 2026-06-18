import { useEffect, useRef, useState } from 'react';

interface BugReportOverlayProps {
  open: boolean;
  onClose: () => void;
}

const RECIPIENT = 'sadhvikac1@gmail.com';

/**
 * We auto-append URL / UA / timestamp so Karl has enough breadcrumbs to
 * reproduce without having to ping the reporter back. Kept out of the
 * visible form so the user only sees one field — same lightweight feel
 * as the "suggest a spot" flow.
 */
function buildMailto(description: string): string {
  const subject = 'Soleil — Bug report';
  const lines = [
    'What happened:',
    description || '(none provided)',
    '',
    '---',
    `URL: ${typeof window !== 'undefined' ? window.location.href : '(unknown)'}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '(unknown)'}`,
    `When: ${new Date().toISOString()}`,
  ];
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export default function BugReportOverlay({ open, onClose }: BugReportOverlayProps) {
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Render-vs-mount split so the slide-out animation can play before
  // unmounting (mirrors SuggestSpotOverlay / SearchOverlay).
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setDescription('');
        setSubmitted(false);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!visible || submitted) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return;
    // Hand off to the user's mail client. We can't observe whether they
    // actually send the message, so we optimistically show the success state.
    window.location.href = buildMailto(trimmed);
    setSubmitted(true);
  }

  if (!mounted) return null;

  const canSubmit = description.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
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
          Something broken? Let Karl know.
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
              Karl's on it. He'll squint at the logs.
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
            <label className="block mb-5">
              <span className="block text-[10px] tracking-[2px] uppercase font-mono text-gray-500 mb-1.5">
                Describe what happened
              </span>
              <textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={6}
                placeholder="Wrong score? Map glitched out? Tell Karl what you were doing."
                className="w-full px-3 py-2 text-sm font-mono bg-cream-dark/40 border border-cream-dark rounded-lg outline-none focus:border-gray-400 transition-colors placeholder:text-gray-400 text-gray-700 resize-y leading-relaxed"
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-11 rounded-lg bg-gray-700 text-cream font-mono text-[11px] tracking-[2px] uppercase transition-colors hover:bg-gray-800 active:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Send to Karl
            </button>

            <p className="mt-3 text-[10px] font-mono text-gray-400 text-center leading-snug">
              Opens your email app. We'll attach the page URL so Karl can retrace your steps.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

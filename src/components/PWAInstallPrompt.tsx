import { useCallback, useEffect, useRef, useState } from 'react';

interface PWAInstallPromptProps {
  /**
   * True once the user has meaningfully engaged with a spot (tapped a pin,
   * opened a score card, etc.). Either this OR a 30-second timer triggers
   * the prompt — whichever happens first.
   */
  spotInteracted: boolean;
}

type Platform = 'ios' | 'android' | 'other';
type IOSBrowser = 'safari' | 'chrome' | 'firefox' | 'opera' | 'edge' | 'other';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'karl-pwa:dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AUTO_SHOW_DELAY_MS = 30_000;
const EXIT_ANIM_MS = 340;
const ENTER_ANIM_MS = 360;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari pre-PWA flag.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac with touch — sniff that out before the desktop bail.
  const isIPadOS =
    ua.includes('Macintosh') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isIPadOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function detectIOSBrowser(): IOSBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (ua.includes('CriOS')) return 'chrome';
  if (ua.includes('FxiOS')) return 'firefox';
  if (ua.includes('OPiOS')) return 'opera';
  if (ua.includes('EdgiOS')) return 'edge';
  // No CriOS/FxiOS/OPiOS/EdgiOS → real Safari (or a webview, which we treat as Safari).
  return 'safari';
}

function readDismissedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage disabled / quota exceeded — non-fatal.
  }
}

function recentlyDismissed(): boolean {
  const at = readDismissedAt();
  if (at === null) return false;
  return Date.now() - at < DISMISS_COOLDOWN_MS;
}

function getIOSStep1Copy(browser: IOSBrowser): string {
  switch (browser) {
    case 'safari':
      return "Hit the share button in Safari's toolbar";
    case 'chrome':
      return 'Tap the share icon (top right) in Chrome';
    case 'firefox':
    case 'opera':
    case 'edge':
    case 'other':
      return 'Tap the share button in your browser';
  }
}

export default function PWAInstallPrompt({ spotInteracted }: PWAInstallPromptProps) {
  // Eligibility resolves once on mount: standalone, desktop, or recently
  // dismissed devices never get the prompt at all, so we don't bother
  // tracking timers / install events.
  const [eligible, setEligible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [iosBrowser, setIOSBrowser] = useState<IOSBrowser>('other');

  const [open, setOpen] = useState(false);
  // Tracks the next paint after `open` flips true so we can transition from
  // the initial "closed" styles into the "open" styles instead of the modal
  // popping in fully formed.
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const triggeredRef = useRef(false);
  const autoTimerRef = useRef<number | null>(null);

  // One-shot mount-time eligibility check. Re-running this on every render
  // would burn the user's standalone check for no reason.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const plat = detectPlatform();
    if (plat === 'other') return;
    if (isStandalone()) return;
    if (recentlyDismissed()) return;
    setPlatform(plat);
    if (plat === 'ios') setIOSBrowser(detectIOSBrowser());
    setEligible(true);
  }, []);

  // Capture Android's deferred install prompt as soon as the browser fires
  // it — which can happen well before the user interacts with anything,
  // so we register unconditionally on mount and just gate use on `eligible`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // If the user installs through the browser UI (or accepts the deferred
  // prompt), tear down so we never paint over a freshly-installed app.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      writeDismissedAt();
      setEligible(false);
      setOpen(false);
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const trigger = useCallback(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setOpen(true);
  }, []);

  // Trigger sources: the 30-second autoshow OR the parent flipping
  // `spotInteracted` true — whichever fires first wins.
  useEffect(() => {
    if (!eligible) return;
    if (triggeredRef.current) return;
    autoTimerRef.current = window.setTimeout(trigger, AUTO_SHOW_DELAY_MS);
    return () => {
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [eligible, trigger]);

  useEffect(() => {
    if (!eligible) return;
    if (!spotInteracted) return;
    trigger();
  }, [eligible, spotInteracted, trigger]);

  // Drive the enter animation: flip `entered` on the next frame after the
  // modal mounts so the CSS transition has a "from" state to interpolate
  // out of.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Lock body scroll while the modal is up so iOS rubber-band doesn't
  // shove the backdrop around. Restored on unmount.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const dismiss = useCallback(() => {
    if (exiting) return;
    writeDismissedAt();
    setExiting(true);
    setEntered(false);
    window.setTimeout(() => {
      setOpen(false);
      setExiting(false);
    }, EXIT_ANIM_MS);
  }, [exiting]);

  const handleAndroidInstall = useCallback(async () => {
    const deferred = deferredPromptRef.current;
    if (!deferred) {
      // No deferred prompt available — either the browser already showed
      // it, or it isn't supported here. Fall back to a normal dismiss so
      // the user isn't stuck staring at a dead button.
      dismiss();
      return;
    }
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferredPromptRef.current = null;
      if (choice.outcome === 'accepted') {
        // `appinstalled` will likely fire too, but mark explicitly so the
        // 7-day cooldown starts immediately even on browsers that don't.
        writeDismissedAt();
      }
    } catch {
      // prompt() can throw if it was already consumed — treat as dismiss.
    } finally {
      dismiss();
    }
  }, [dismiss]);

  if (!open) return null;

  const visible = entered && !exiting;
  const headline = platform === 'ios' ? 'Add Karl to your dock' : 'Install Ask Karl';
  const subtitle =
    platform === 'ios'
      ? 'So I can ruin your sunset plans faster. No app store required.'
      : 'Pin me to your home screen. You know you want to.';

  return (
    <>
      <style>{styles}</style>
      <div
        className="karl-pwa-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="karl-pwa-headline"
      >
        <div
          className={`karl-pwa-backdrop ${visible ? 'karl-pwa-backdrop--visible' : ''}`}
          onClick={dismiss}
          aria-hidden="true"
        />
        <div
          className={`karl-pwa-modal ${visible ? 'karl-pwa-modal--visible' : ''}`}
          role="document"
        >
          <button
            type="button"
            className="karl-pwa-close"
            onClick={dismiss}
            aria-label="Close install prompt"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 2L12 12M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="karl-pwa-header">
            <div className="karl-pwa-fog-wisp karl-pwa-fog-wisp--a" aria-hidden="true" />
            <div className="karl-pwa-fog-wisp karl-pwa-fog-wisp--b" aria-hidden="true" />
            <div className="karl-pwa-icon-square">
              <CloudIcon />
            </div>
            <h2 id="karl-pwa-headline" className="karl-pwa-headline">
              {headline}
            </h2>
            <p className="karl-pwa-subtitle">{subtitle}</p>
          </div>

          {platform === 'ios' ? (
            <IOSContent browser={iosBrowser} onPrimary={dismiss} onSecondary={dismiss} />
          ) : (
            <AndroidContent onPrimary={handleAndroidInstall} onSecondary={dismiss} />
          )}
        </div>
      </div>
    </>
  );
}

interface IOSContentProps {
  browser: IOSBrowser;
  onPrimary: () => void;
  onSecondary: () => void;
}

function IOSContent({ browser, onPrimary, onSecondary }: IOSContentProps) {
  const step1Copy = getIOSStep1Copy(browser);
  return (
    <>
      <ol className="karl-pwa-steps">
        <li className="karl-pwa-step">
          <div className="karl-pwa-step-icon">
            <ShareIcon />
          </div>
          <div className="karl-pwa-step-body">
            <div className="karl-pwa-step-title">
              <span className="karl-pwa-step-num">1.</span> Tap Share
            </div>
            <div className="karl-pwa-step-desc">{step1Copy}</div>
          </div>
        </li>
        <li className="karl-pwa-step">
          <div className="karl-pwa-step-icon">
            <PlusSquareIcon />
          </div>
          <div className="karl-pwa-step-body">
            <div className="karl-pwa-step-title">
              <span className="karl-pwa-step-num">2.</span> Add to Home Screen
            </div>
            <div className="karl-pwa-step-desc">
              Scroll down and tap &lsquo;Add to Home Screen&rsquo;
            </div>
          </div>
        </li>
        <li className="karl-pwa-step">
          <div className="karl-pwa-step-icon">
            <CheckCircleIcon />
          </div>
          <div className="karl-pwa-step-body">
            <div className="karl-pwa-step-title">
              <span className="karl-pwa-step-num">3.</span> Tap Add
            </div>
            <div className="karl-pwa-step-desc">Karl moves in. No rent required.</div>
          </div>
        </li>
      </ol>
      <div className="karl-pwa-actions">
        <button type="button" className="karl-pwa-btn-primary" onClick={onPrimary}>
          Got it
        </button>
        <button type="button" className="karl-pwa-btn-text" onClick={onSecondary}>
          Maybe later
        </button>
      </div>
    </>
  );
}

interface AndroidContentProps {
  onPrimary: () => void | Promise<void>;
  onSecondary: () => void;
}

function AndroidContent({ onPrimary, onSecondary }: AndroidContentProps) {
  return (
    <div className="karl-pwa-actions karl-pwa-actions--android">
      <button
        type="button"
        className="karl-pwa-btn-primary"
        onClick={() => {
          void onPrimary();
        }}
      >
        Install to Home Screen
      </button>
      <button type="button" className="karl-pwa-btn-text" onClick={onSecondary}>
        Not now
      </button>
    </div>
  );
}

function CloudIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.78 6 6 0 1 0-11.59 2.78A4 4 0 0 0 6 19h11.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v13" />
      <path d="M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.75 2.75L16 9.75" />
    </svg>
  );
}

const styles = `
.karl-pwa-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family: 'DM Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
  padding-top: max(24px, env(safe-area-inset-top));
}

.karl-pwa-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(26, 22, 18, 0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  transition:
    background-color 320ms cubic-bezier(0.16, 1, 0.3, 1),
    backdrop-filter 320ms cubic-bezier(0.16, 1, 0.3, 1),
    -webkit-backdrop-filter 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

.karl-pwa-backdrop--visible {
  background: rgba(26, 22, 18, 0.42);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.karl-pwa-modal {
  position: relative;
  width: 100%;
  max-width: 360px;
  background: #FAF7F2;
  border-radius: 20px;
  box-shadow:
    0 24px 60px rgba(26, 22, 18, 0.28),
    0 4px 14px rgba(26, 22, 18, 0.12);
  padding: 26px 22px 20px;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.92) translateY(8px);
  transition:
    opacity ${ENTER_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
    transform ${ENTER_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
}

.karl-pwa-modal--visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.karl-pwa-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(42, 38, 34, 0.06);
  color: #2A2622;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: background-color 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.karl-pwa-close:hover,
.karl-pwa-close:active {
  background: rgba(42, 38, 34, 0.12);
}

.karl-pwa-header {
  position: relative;
  text-align: center;
  padding: 4px 4px 18px;
}

.karl-pwa-fog-wisp {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(20px);
  opacity: 0.55;
}

.karl-pwa-fog-wisp--a {
  width: 180px;
  height: 110px;
  top: -40px;
  left: -50px;
  background: radial-gradient(circle, rgba(91, 154, 123, 0.28) 0%, rgba(91, 154, 123, 0) 70%);
}

.karl-pwa-fog-wisp--b {
  width: 160px;
  height: 110px;
  top: -30px;
  right: -60px;
  background: radial-gradient(circle, rgba(91, 154, 123, 0.18) 0%, rgba(91, 154, 123, 0) 70%);
}

.karl-pwa-icon-square {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #5B9A7B 0%, #4A8568 100%);
  color: #FAF7F2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 6px 16px rgba(74, 133, 104, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.karl-pwa-headline {
  position: relative;
  margin: 0;
  font-family: 'DM Serif Display', 'Source Serif 4', serif;
  font-weight: 400;
  font-size: 22px;
  line-height: 1.2;
  color: #2A2622;
  letter-spacing: -0.01em;
}

.karl-pwa-subtitle {
  position: relative;
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.45;
  color: #8A8279;
}

.karl-pwa-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid rgba(42, 38, 34, 0.06);
}

.karl-pwa-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 4px;
  border-bottom: 1px solid rgba(42, 38, 34, 0.06);
}

.karl-pwa-step:last-child {
  border-bottom: none;
}

.karl-pwa-step-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #5B9A7B 0%, #4A8568 100%);
  color: #FAF7F2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 3px 8px rgba(74, 133, 104, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.karl-pwa-step-body {
  flex: 1;
  min-width: 0;
}

.karl-pwa-step-title {
  font-size: 14.5px;
  font-weight: 500;
  color: #2A2622;
  line-height: 1.3;
}

.karl-pwa-step-num {
  color: #8A8279;
  font-weight: 500;
  margin-right: 4px;
}

.karl-pwa-step-desc {
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.45;
  color: #8A8279;
}

.karl-pwa-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.karl-pwa-actions--android {
  margin-top: 4px;
}

.karl-pwa-btn-primary {
  appearance: none;
  border: none;
  width: 100%;
  padding: 14px 18px;
  border-radius: 13px;
  background: linear-gradient(135deg, #5B9A7B 0%, #4A8568 100%);
  color: #FAF7F2;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow:
    0 6px 14px rgba(74, 133, 104, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.karl-pwa-btn-primary:hover {
  filter: brightness(1.04);
}

.karl-pwa-btn-primary:active {
  transform: scale(0.985);
  box-shadow:
    0 3px 8px rgba(74, 133, 104, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.karl-pwa-btn-text {
  appearance: none;
  border: none;
  background: transparent;
  width: 100%;
  padding: 10px 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  color: #8A8279;
  cursor: pointer;
  border-radius: 10px;
  transition: background-color 140ms ease, color 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.karl-pwa-btn-text:hover,
.karl-pwa-btn-text:active {
  background: rgba(42, 38, 34, 0.05);
  color: #2A2622;
}

@media (prefers-reduced-motion: reduce) {
  .karl-pwa-modal,
  .karl-pwa-backdrop {
    transition-duration: 1ms;
  }
}
`;

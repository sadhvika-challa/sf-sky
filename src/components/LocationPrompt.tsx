import { useEffect, useRef } from 'react';
import LocationControl from './LocationControl';
import type { LocationState } from '../hooks/useLocation';
import type { OpenAppSettingsResult } from '../platform/appSettings';

interface LocationPromptProps {
  state: LocationState;
  onRequest: () => Promise<LocationState>;
  onChooseCity: () => void;
  onUseCityInstead: () => void;
  onClose: () => void;
  canOpenLocationSettings: boolean;
  onOpenLocationSettings: () => Promise<OpenAppSettingsResult>;
}

export default function LocationPrompt({ onClose, ...props }: LocationPromptProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overlay = dialog.parentElement!;
    const siblings = [...overlay.parentElement!.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    dialog.focus({ preventScroll: true });
    return () => {
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/25 p-5 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-prompt-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-[#FAF9F6] p-5 shadow-xl outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
      >
        <h2 id="location-prompt-title" className="mb-3 font-serif text-2xl text-gray-800">Find nearby spots</h2>
        <LocationControl {...props} onRequest={async () => {
          const result = await props.onRequest();
          if (result.status === 'allowed') onClose();
          return result;
        }} />
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-lg px-3 font-mono text-[11px] text-gray-600 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-gray-700">Not now</button>
      </div>
    </div>
  );
}

export const LOCATION_PROMPT_SESSION_KEY = 'soleil:location-prompt-dismissed:v1';

export function wasLocationPromptDismissed(): boolean {
  try { return sessionStorage.getItem(LOCATION_PROMPT_SESSION_KEY) === '1'; }
  catch { return false; }
}

export function rememberLocationPromptDismissal(): void {
  try { sessionStorage.setItem(LOCATION_PROMPT_SESSION_KEY, '1'); }
  catch { /* Browsing still works when session storage is unavailable. */ }
}

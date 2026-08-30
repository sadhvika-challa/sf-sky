import { Capacitor } from '@capacitor/core';

export const DEFAULT_PUBLIC_WEB_ORIGIN = 'https://go-outside-six.vercel.app';

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

function validHttpsOrigin(candidate: string | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

interface PublicOriginOptions {
  native?: boolean;
  currentOrigin?: string;
  configuredOrigin?: string;
}

/**
 * Web shares remain on the currently deployed origin. Native shares use the
 * canonical public web origin because capacitor://localhost is not a useful
 * recipient URL.
 */
export function getPublicShareOrigin(options: PublicOriginOptions = {}): string {
  const native = options.native ?? isNativeRuntime();
  const currentOrigin = options.currentOrigin ?? (
    typeof window === 'undefined' ? undefined : window.location.origin
  );
  if (!native) {
    return validHttpsOrigin(currentOrigin) ?? currentOrigin ?? DEFAULT_PUBLIC_WEB_ORIGIN;
  }

  const configuredOrigin = options.configuredOrigin ?? import.meta.env.VITE_PUBLIC_WEB_ORIGIN;
  return validHttpsOrigin(configuredOrigin) ?? DEFAULT_PUBLIC_WEB_ORIGIN;
}

export function buildPublicShareUrl(path: string): string {
  return new URL(path, `${getPublicShareOrigin()}/`).toString();
}

export function getCurrentPublicShareUrl(): string {
  if (typeof window === 'undefined') return `${DEFAULT_PUBLIC_WEB_ORIGIN}/`;
  if (!isNativeRuntime()) return window.location.href;
  const { pathname, search, hash } = window.location;
  return buildPublicShareUrl(`${pathname}${search}${hash}`);
}

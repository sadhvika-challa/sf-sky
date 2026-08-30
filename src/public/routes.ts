export type PublicRoute = 'privacy' | 'support'

const PUBLIC_PATHS: Readonly<Record<string, PublicRoute>> = {
  '/soleil/privacy': 'privacy',
  '/soleil/privacy/': 'privacy',
  '/soleil/support': 'support',
  '/soleil/support/': 'support',
}

export function matchPublicRoute(pathname: string): PublicRoute | null {
  return PUBLIC_PATHS[pathname] ?? null
}

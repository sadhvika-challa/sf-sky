import { PUBLIC_PRIVACY_PATH, PUBLIC_SUPPORT_PATH } from '../platform/publicUrlContract'

export type PublicRoute = 'privacy' | 'support'

const PUBLIC_PATHS: Readonly<Record<string, PublicRoute>> = {
  [PUBLIC_PRIVACY_PATH]: 'privacy',
  [`${PUBLIC_PRIVACY_PATH}/`]: 'privacy',
  [PUBLIC_SUPPORT_PATH]: 'support',
  [`${PUBLIC_SUPPORT_PATH}/`]: 'support',
}

export function matchPublicRoute(pathname: string): PublicRoute | null {
  return PUBLIC_PATHS[pathname] ?? null
}

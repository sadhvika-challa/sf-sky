import { describe, expect, it } from 'vitest'
import { matchPublicRoute } from '../routes'

describe('public page route matching', () => {
  it.each([
    ['/soleil/privacy', 'privacy'],
    ['/soleil/privacy/', 'privacy'],
    ['/soleil/support', 'support'],
    ['/soleil/support/', 'support'],
  ] as const)('matches the exact public route %s', (pathname, route) => {
    expect(matchPublicRoute(pathname)).toBe(route)
  })

  it.each([
    '/',
    '/soleil',
    '/privacy',
    '/support',
    '/soleil/privacy/extra',
    '/soleil/support/contact',
    '/soleil//privacy',
    '/Soleil/privacy',
  ])('does not claim unrelated path %s', (pathname) => {
    expect(matchPublicRoute(pathname)).toBeNull()
  })
})

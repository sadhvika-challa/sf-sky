import { describe, expect, it, vi } from 'vitest'
import { parsePublicOrigin, verifyPublicOrigin } from '../../../scripts/verify-public-origin.mjs'

const contract = {
  privacy: '/soleil/privacy',
  support: '/soleil/support',
  manifest: '/manifest.json',
  worker: '/sw.js',
  icons: [
    ['/icons/icon-192.png', 192],
    ['/icons/icon-512.png', 512],
    ['/icons/apple-touch-icon.png', 180],
  ] as const,
}

function requestUrl(input: URL | RequestInfo): URL {
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  return new URL(input.url)
}

function response(url: string, body: BodyInit | null, options: {
  status?: number
  contentType?: string
  headers?: Record<string, string>
} = {}): Response {
  const result = new Response(body, {
    status: options.status ?? 200,
    headers: { 'content-type': options.contentType ?? 'text/html; charset=utf-8', ...options.headers },
  })
  Object.defineProperty(result, 'url', { value: url })
  return result
}

function png(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, size)
  view.setUint32(20, size)
  return bytes
}

function successfulFetch({ manifestId = '/' } = {}) {
  return vi.fn(async (input: URL | RequestInfo, options?: RequestInit) => {
    const url = requestUrl(input)
    expect(options?.redirect).toBe('manual')
    expect((options?.headers as Record<string, string>).authorization).toBeUndefined()

    if (url.pathname === contract.manifest) {
      return response(url.toString(), JSON.stringify({
        name: 'Soleil',
        id: manifestId,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        icons: contract.icons.map(([src, size]) => ({ src, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
      }), { contentType: 'application/json; charset=utf-8' })
    }
    if (url.pathname === contract.worker) {
      return response(url.toString(), "self.addEventListener('install', () => {}); self.addEventListener('fetch', () => {});", {
        contentType: 'application/javascript; charset=utf-8',
      })
    }
    const icon = contract.icons.find(([path]) => path === url.pathname)
    if (icon) return response(url.toString(), png(icon[1]), { contentType: 'image/png' })
    return response(url.toString(), '<!doctype html><title>Soleil</title><div id="root"></div>')
  })
}

describe('public release origin verifier', () => {
  it('accepts only a root HTTPS origin', () => {
    expect(parsePublicOrigin('https://release.example')).toBe('https://release.example')
    expect(() => parsePublicOrigin('https://release.example/soleil')).toThrow(/without credentials, a path, a query, or a hash/)
    expect(() => parsePublicOrigin('http://release.example')).toThrow(/must be an HTTPS origin/)
  })

  it('proves anonymous direct HTML, PWA, service-worker, and icon responses', async () => {
    const fetchMock = successfulFetch()
    const result = await verifyPublicOrigin({
      origin: 'https://release.example',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.origin).toBe('https://release.example')
    expect(result.evidence).toHaveLength(9)
    expect(fetchMock).toHaveBeenCalledTimes(9)
    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url).pathname)).toEqual([
      '/',
      '/',
      contract.privacy,
      contract.support,
      contract.manifest,
      contract.worker,
      ...contract.icons.map(([path]) => path),
    ])
  })

  it('rejects authentication and redirect responses instead of following them', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => response(requestUrl(input).toString(), '', {
      status: 307,
      contentType: 'text/plain',
      headers: { location: 'https://login.example/session' },
    }))

    await expect(verifyPublicOrigin({
      origin: 'https://release.example',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow(/direct anonymous 200.*307.*login\.example/)
  })

  it('rejects a manifest whose installed identity escapes the root contract', async () => {
    const fetchMock = successfulFetch({ manifestId: '/soleil/' })

    await expect(verifyPublicOrigin({
      origin: 'https://release.example',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('PWA manifest id must be /. Received: /soleil/')
  })
})

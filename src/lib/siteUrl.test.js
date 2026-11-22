import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSiteBaseUrl, isLocalAddress } from './siteUrl.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getSiteBaseUrl', () => {
  it('trims whitespace and trailing slashes from the configured address', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', '  https://chada.example/menu///  ')
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })

    expect(getSiteBaseUrl()).toBe('https://chada.example/menu')
  })

  it('uses the current origin when no address is configured', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_URL', '')
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })

    expect(getSiteBaseUrl()).toBe('http://localhost:5173')
  })
})

describe('isLocalAddress', () => {
  it.each([
    ['localhost', 'http://localhost:5173'],
    ['IPv4 loopback', 'http://127.0.0.1:5173'],
    ['another 127 address', 'http://127.28.4.9'],
    ['IPv6 loopback', 'http://[::1]:5173'],
    ['a .local host', 'http://kitchen.local'],
    ['10.x private address', 'http://10.28.1.5'],
    ['192.168.x private address', 'http://192.168.1.5'],
    ['start of the 172.16/12 range', 'http://172.16.0.1'],
    ['end of the 172.16/12 range', 'http://172.31.255.254'],
  ])('recognizes %s', (_label, url) => {
    expect(isLocalAddress(url)).toBe(true)
  })

  it.each([
    ['outside the 172.16/12 range below', 'http://172.15.0.1'],
    ['outside the 172.16/12 range above', 'http://172.32.0.1'],
    ['another private-looking range', 'http://192.169.1.1'],
    ['a public host', 'https://chada.example'],
    ['an invalid IPv4 octet', 'http://127.256.0.1'],
  ])('does not classify %s as local', (_label, url) => {
    expect(isLocalAddress(url)).toBe(false)
  })

  it.each(['not a URL', 'http://', ''])('returns false for an unparseable address: %s', (url) => {
    expect(isLocalAddress(url)).toBe(false)
  })
})

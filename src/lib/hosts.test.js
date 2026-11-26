import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// hosts.js reads its settings when it loads, so every case sets them first and imports it fresh.
async function loadHosts(site, staff) {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_SITE_URL', site)
  vi.stubEnv('VITE_STAFF_SITE_URL', staff)
  return import('./hosts.js')
}

const SITE = 'https://meat-me-at-chada.tech'
const STAFF = 'https://staff.meat-me-at-chada.tech'

describe('sideForHost with both addresses set', () => {
  it('tells the staff address from the guest address', async () => {
    const { sideForHost } = await loadHosts(SITE, STAFF)

    expect(sideForHost('staff.meat-me-at-chada.tech')).toBe('staff')
    expect(sideForHost('meat-me-at-chada.tech')).toBe('guest')
    expect(sideForHost('Meat-Me-At-Chada.TECH')).toBe('guest')
  })

  it('treats www of the guest address and localhost as guest', async () => {
    const { sideForHost } = await loadHosts(SITE, STAFF)

    expect(sideForHost('www.meat-me-at-chada.tech')).toBe('guest')
    expect(sideForHost('localhost')).toBe('guest')
    expect(sideForHost('127.0.0.1')).toBe('guest')
  })

  it.each([
    ['the old workers address', 'meat-me-at-chada.damon.workers.dev'],
    ['a preview address', 'a1b2c3d4-meat-me-at-chada.damon.workers.dev'],
    ['a pages address', 'meat-me-at-chada.pages.dev'],
    ['another subdomain', 'admin.meat-me-at-chada.tech'],
    ['an empty host', ''],
  ])('blocks %s', async (_name, hostname) => {
    const { sideForHost } = await loadHosts(SITE, STAFF)

    expect(sideForHost(hostname)).toBe('blocked')
  })
})

describe('sideForHost when the split is off', () => {
  it.each([
    ['both unset', '', ''],
    ['only the guest address set', SITE, ''],
    ['only the staff address set', '', STAFF],
    ['both the same', SITE, SITE],
  ])('leaves every address open with %s', async (_name, site, staff) => {
    const { sideForHost } = await loadHosts(site, staff)

    expect(sideForHost('meat-me-at-chada.damon.workers.dev')).toBe('both')
    expect(sideForHost('meat-me-at-chada.tech')).toBe('both')
  })
})

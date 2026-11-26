import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Forbidden from './Forbidden.jsx'

const STAFF_HOST = 'staff.meat-me-at-chada.tech'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function at(location) {
  vi.stubGlobal('window', { location: { hostname: 'meat-me-at-chada.tech', search: '', hash: '', ...location } })
}

describe('Forbidden', () => {
  it('says forbidden and never names the staff address', () => {
    at({ pathname: '/staff/login' })

    const html = renderToString(<Forbidden />)

    expect(html).toContain('Forbidden')
    expect(html).toContain('/staff/login')
    expect(html).not.toContain(STAFF_HOST)
  })
})

describe('Blocked', () => {
  async function render(location) {
    vi.resetModules()
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://meat-me-at-chada.tech')
    vi.stubEnv('VITE_STAFF_SITE_URL', `https://${STAFF_HOST}`)
    at({ hostname: 'meat-me-at-chada.damon.workers.dev', ...location })
    const { default: Blocked } = await import('./Blocked.jsx')
    return renderToString(<Blocked />)
  }

  it.each(['/login', '/staff', '/staff/dashboard'])('shows Forbidden, not the staff address, for %s on an unknown address', async (pathname) => {
    const html = await render({ pathname })

    expect(html).toContain('Forbidden')
    expect(html).not.toContain(STAFF_HOST)
  })

  it('sends a guest link on an unknown address to the same page on the guest address', async () => {
    const html = await render({ pathname: '/menu/abc123', search: '?x=1' })

    expect(html).toContain('href="https://meat-me-at-chada.tech/menu/abc123?x=1"')
    expect(html).not.toContain(STAFF_HOST)
  })
})

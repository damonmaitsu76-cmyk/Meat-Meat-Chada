import { useEffect } from 'react'
import { siteUrl } from '../lib/hosts.js'
import Forbidden from './Forbidden.jsx'
import './Blocked.css'

function Retired() {
  const { hostname, pathname, search, hash } = window.location
  const target = `${siteUrl}${pathname}${search}${hash}`
  const targetHost = new URL(siteUrl).host

  useEffect(() => {
    document.title = 'Address retired | Samgyup Chada'
  }, [])

  return (
    <main className="blocked" aria-labelledby="blocked-title">
      <div className="blocked-ticket">
        <header className="blocked-bar">
          <span className="blocked-brand">Samgyup Chada</span>
          <span className="blocked-code ticket">403</span>
        </header>

        <div className="blocked-body">
          <h1 id="blocked-title">This address is no longer in use</h1>
          <p>The page you opened has moved. Open the same page on the new address.</p>
          {pathname.startsWith('/menu/') && (
            <p>The button keeps your table&apos;s link, so you land on the same menu.</p>
          )}
        </div>

        <dl className="blocked-stub">
          <div>
            <dt>You opened</dt>
            <dd className="ticket">{hostname}</dd>
          </div>
          <div>
            <dt>Use instead</dt>
            <dd className="ticket">{targetHost}</dd>
          </div>
        </dl>

        <div className="blocked-action">
          <a className="btn full" href={target}>Go to {targetHost}</a>
        </div>
      </div>
    </main>
  )
}

// Shown on any address that is not the guest or staff address (see src/lib/hosts.js),
// for example the old *.workers.dev address. Staff-only paths get the plain Forbidden page,
// which never names the staff address; everything else is sent to the same page on the guest address.
export default function Blocked() {
  const { pathname } = window.location
  const wantsStaff = pathname === '/login' || pathname === '/staff' || pathname.startsWith('/staff/')
  return wantsStaff ? <Forbidden home={siteUrl} /> : <Retired />
}

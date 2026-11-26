import { useEffect } from 'react'
import './Blocked.css'

// Shown when someone opens a staff-only page (/login, /staff/...) on any address except the staff
// one. It never names or links to the staff address. It shares its look with Blocked.jsx.
export default function Forbidden({ home = '/' }) {
  const { pathname } = window.location

  useEffect(() => {
    document.title = 'Forbidden | Samgyup Chada'
  }, [])

  return (
    <main className="blocked" aria-labelledby="forbidden-title">
      <div className="blocked-ticket">
        <header className="blocked-bar">
          <span className="blocked-brand">Samgyup Chada</span>
          <span className="blocked-code ticket">403</span>
        </header>

        <div className="blocked-body">
          <h1 id="forbidden-title">Forbidden</h1>
          <p>You do not have permission to open this page.</p>
        </div>


        <div className="blocked-action">
          <a className="btn full" href={home}>Go to the home page</a>
        </div>
      </div>
    </main>
  )
}

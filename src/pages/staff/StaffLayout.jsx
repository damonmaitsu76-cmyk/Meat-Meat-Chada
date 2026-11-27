import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.js'
import { ADMIN_ROLES, ROLE_LABEL, STAFF_ROLES } from '../../auth/roles.js'
import Modal from '../../components/Modal.jsx'
import { withViewTransition } from '../../lib/viewTransition.js'
import { LiveStatusContext } from '../../components/liveStatus.js'
import { LiveIndicator } from '../../components/ui.jsx'
import useRequestAlarm from './useRequestAlarm.js'
import useStaffCounts from './useStaffCounts.js'
import '../../styles/staff.css'

const NAV = [
  { to: '/staff/dashboard', label: 'Dashboard', roles: STAFF_ROLES, daily: true },
  { to: '/staff/requests', label: 'Requests', roles: STAFF_ROLES, daily: true },
  { to: '/staff/reservations', label: 'Reservations', roles: STAFF_ROLES, daily: true },
  { to: '/staff/menu', label: 'Menu', roles: STAFF_ROLES, daily: true },
  { to: '/staff/tables', label: 'Tables & QR', roles: ADMIN_ROLES },
  { to: '/staff/import', label: 'Import', roles: ADMIN_ROLES },
  { to: '/staff/reports', label: 'Reports', roles: ADMIN_ROLES },
  { to: '/staff/accounts', label: 'Accounts', roles: ADMIN_ROLES },
  { to: '/staff/settings', label: 'Settings', roles: ADMIN_ROLES },
]

function CountLabel({ item, counts }) {
  const count = item.to === '/staff/requests' ? counts.requests : item.to === '/staff/reservations' ? counts.reservations : 0
  const extra = item.to === '/staff/requests' ? 'active' : 'pending'
  return <>{item.label}{count > 0 && <span className="nav-count" aria-label={`${count} ${extra}`}> · {count}</span>}</>
}

export default function StaffLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const counts = useStaffCounts()
  useRequestAlarm()
  const [moreOpen, setMoreOpen] = useState(false)
  const [live, setLive] = useState(false)
  const reportLive = useCallback((value) => setLive(value === true), [])
  const links = NAV.filter((item) => item.roles.includes(profile.role))
  const dailyLinks = links.filter((item) => item.daily)
  const adminLinks = links.filter((item) => !item.daily)
  const inMore = adminLinks.some((item) => location.pathname.startsWith(item.to))

  async function logout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <LiveStatusContext.Provider value={reportLive}>
    <div className="staff-shell">
        <header className="staff-top">
          <span className="brand">Samgyup Chada</span>
          <span className="staff-user">
            <span className="staff-identity">{profile.username}<span className="role"> · {ROLE_LABEL[profile.role] || profile.role}</span></span>
            <LiveIndicator live={live} />
          </span>
          <button className="btn-link" type="button" onClick={logout}>Log out</button>
        </header>

        <nav className="staff-nav" aria-label="Staff screens">
          {links.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={withViewTransition(navigate, item.to)} className={({ isActive }) => (isActive ? 'active' : '')}>
              <CountLabel item={item} counts={counts} />
            </NavLink>
          ))}
        </nav>

        <main className="staff-main"><Outlet /></main>

        <nav className={`staff-bottom-nav ${adminLinks.length ? 'has-more' : ''}`} aria-label="Daily staff screens">
          {dailyLinks.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={withViewTransition(navigate, item.to)} aria-label={item.to === '/staff/requests' && counts.requests ? `Requests, ${counts.requests} active` : item.to === '/staff/reservations' && counts.reservations ? `Reservations, ${counts.reservations} pending` : item.label} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}{(item.to === '/staff/requests' ? counts.requests : item.to === '/staff/reservations' ? counts.reservations : 0) > 0 && <span className="nav-count"> · {item.to === '/staff/requests' ? counts.requests : counts.reservations}</span>}
            </NavLink>
          ))}
          {adminLinks.length > 0 && <button type="button" className={inMore ? 'active' : ''} aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>More</button>}
        </nav>

        {moreOpen && (
          <Modal title="More staff screens" onClose={() => setMoreOpen(false)}>
            <nav className="more-links" aria-label="More staff screens">
              {adminLinks.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={(event) => { setMoreOpen(false); withViewTransition(navigate, item.to)(event) }}>{item.label}</NavLink>
              ))}
            </nav>
          </Modal>
        )}
      </div>
    </LiveStatusContext.Provider>
  )
}

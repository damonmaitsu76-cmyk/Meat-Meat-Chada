import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.js'
import { ADMIN_ROLES, STAFF_ROLES } from '../../auth/roles.js'
import '../../staff.css'

// Add each new staff page here. The side menu only shows the pages the user's role may open.
const NAV = [
  { to: '/staff/dashboard', label: 'Dashboard', roles: STAFF_ROLES },
  { to: '/staff/requests', label: 'Request Queue', roles: STAFF_ROLES },
  { to: '/staff/reservations', label: 'Reservations', roles: STAFF_ROLES },
  { to: '/staff/menu', label: 'Menu', roles: STAFF_ROLES },
  { to: '/staff/tables', label: 'Tables & QR', roles: ADMIN_ROLES },
  { to: '/staff/settings', label: 'Settings', roles: ADMIN_ROLES },
]

export default function StaffLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const links = NAV.filter((n) => n.roles.includes(profile.role))

  async function logout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="staff-shell">
      <header className="staff-top">
        <span className="brand">Samgyup Chada</span>
        <span className="staff-user">
          {profile.username} · <span className="role">{profile.role}</span>
        </span>
        <button className="btn-link" onClick={logout}>
          Log out
        </button>
      </header>

      <nav className="staff-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
          </NavLink>
        ))}
      </nav>

      <main className="staff-main">
        <Outlet />
      </main>
    </div>
  )
}

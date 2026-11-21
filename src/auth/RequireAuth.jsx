import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.js'

// Route guard: wrap routes in <Route element={<RequireAuth roles={[...]} />}>.
export default function RequireAuth({ roles }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="center-screen">
        <p>Loading…</p>
      </div>
    )
  }
  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (roles && !roles.includes(profile.role)) {
    return (
      <div className="center-screen">
        <h1>Not allowed</h1>
        <p>Your account does not have access to this page.</p>
      </div>
    )
  }
  return <Outlet />
}

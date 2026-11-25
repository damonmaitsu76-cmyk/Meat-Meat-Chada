import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import { ADMIN_ROLES, STAFF_ROLES } from './auth/roles.js'
import { currentSide, siteUrl, staffUrl } from './lib/hosts.js'
import Login from './pages/staff/Login.jsx'
import QRMenu from './pages/customer/QRMenu.jsx'
import Reserve from './pages/customer/Reserve.jsx'
import Dashboard from './pages/staff/Dashboard.jsx'
import ImportData from './pages/staff/ImportData.jsx'
import MenuManagement from './pages/staff/MenuManagement.jsx'
import Reports from './pages/staff/Reports.jsx'
import RequestQueue from './pages/staff/RequestQueue.jsx'
import Reservations from './pages/staff/Reservations.jsx'
import Settings from './pages/staff/Settings.jsx'
import StaffAccounts from './pages/staff/StaffAccounts.jsx'
import StaffLayout from './pages/staff/StaffLayout.jsx'
import TableManagement from './pages/staff/TableManagement.jsx'
import DesignFixture from './pages/DesignFixture.jsx'
import Landing from './pages/Landing.jsx'

function Message({ title, text }) {
  return (
    <main className="center-screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  )
}

// Opens the same page on the other address. It is a full page load, because it is another site.
function GoTo({ base }) {
  const { pathname, search, hash } = useLocation()
  useEffect(() => {
    window.location.replace(`${base}${pathname}${search}${hash}`)
  }, [base, pathname, search, hash])
  return (
    <main className="center-screen">
      <p>Opening the right page…</p>
    </main>
  )
}

export default function App() {
  // 'staff' on the staff address, 'guest' on the main one, 'both' when the split is off
  // (local dev, pages.dev). See src/lib/hosts.js.
  const side = currentSide()
  const showGuest = side !== 'staff'
  const showStaff = side !== 'guest'

  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/__design" element={<DesignFixture />} />}

      {/* customers (no login) */}
      {showGuest ? (
        <>
          <Route path="/" element={<Landing />} />
          <Route path="/menu/:qrToken" element={<QRMenu />} />
          <Route path="/reserve" element={<Reserve />} />
        </>
      ) : (
        <>
          {/* the staff address opens the staff app; a guest link that lands here moves to the main address */}
          <Route path="/" element={<Navigate to="/staff/dashboard" replace />} />
          <Route path="/menu/:qrToken" element={<GoTo base={siteUrl} />} />
          <Route path="/reserve" element={<GoTo base={siteUrl} />} />
        </>
      )}

      {/* staff and managers */}
      {showStaff ? (
        <>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth roles={STAFF_ROLES} />}>
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="requests" element={<RequestQueue />} />
              <Route path="reservations" element={<Reservations />} />
              <Route path="menu" element={<MenuManagement />} />
              {/* managers only */}
              <Route element={<RequireAuth roles={ADMIN_ROLES} />}>
                <Route path="tables" element={<TableManagement />} />
                <Route path="import" element={<ImportData />} />
                <Route path="reports" element={<Reports />} />
                <Route path="accounts" element={<StaffAccounts />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>
        </>
      ) : (
        <>
          {/* old /staff bookmarks and links on the main address move to the staff address */}
          <Route path="/login" element={<GoTo base={staffUrl} />} />
          <Route path="/staff/*" element={<GoTo base={staffUrl} />} />
        </>
      )}

      <Route
        path="*"
        element={<Message title="Page not found" text="Please scan the QR code on your table." />}
      />
    </Routes>
  )
}

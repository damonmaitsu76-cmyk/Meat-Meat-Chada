import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import { ADMIN_ROLES, STAFF_ROLES } from './auth/roles.js'
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
import Home from './pages/Home.jsx'

function Message({ title, text }) {
  return (
    <main className="center-screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/__design" element={<DesignFixture />} />}
      {/* customers (no login) */}
      <Route path="/" element={<Home />} />
      <Route path="/menu/:qrToken" element={<QRMenu />} />
      <Route path="/reserve" element={<Reserve />} />

      {/* staff and managers */}
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

      <Route
        path="*"
        element={<Message title="Page not found" text="Please scan the QR code on your table." />}
      />
    </Routes>
  )
}

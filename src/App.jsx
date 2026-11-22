import { Link, Navigate, Route, Routes } from 'react-router-dom'
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

function Message({ title, text }) {
  return (
    <main className="center-screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  )
}

function Home() {
  return (
    <div className="home-screen">
      <header className="topbar"><span className="brand">Samgyup Chada</span></header>
      <main className="home-content">
        <h1>Meat Me at Chada</h1>
        <p>Scan the QR code at your table to order refills, or reserve a table ahead of your visit.</p>
        <Link className="btn" to="/reserve">Reserve a table</Link>
      </main>
    </div>
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

      {/* staff and administrators */}
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth roles={STAFF_ROLES} />}>
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requests" element={<RequestQueue />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="menu" element={<MenuManagement />} />
          {/* administrators only */}
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

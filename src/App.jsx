import { Link, Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import { ADMIN_ROLES, STAFF_ROLES } from './auth/roles.js'
import Login from './pages/Login.jsx'
import QRMenu from './pages/QRMenu.jsx'
import Reserve from './pages/Reserve.jsx'
import Dashboard from './pages/staff/Dashboard.jsx'
import RequestQueue from './pages/staff/RequestQueue.jsx'
import Reservations from './pages/staff/Reservations.jsx'
import StaffLayout from './pages/staff/StaffLayout.jsx'
import TableManagement from './pages/staff/TableManagement.jsx'

function Message({ title, text }) {
  return (
    <div className="center-screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  )
}

function Home() {
  return (
    <div className="center-screen">
      <h1>Meat Me at Chada</h1>
      <p>Please scan the QR code on your table to open the menu.</p>
      <p>
        <Link className="btn" to="/reserve">
          Reserve a table
        </Link>
      </p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* customers (no login) */}
      <Route path="/" element={<Home />} />
      <Route path="/menu/:qrToken" element={<QRMenu />} />
      <Route path="/reserve" element={<Reserve />} />

      {/* staff, manager, owner */}
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth roles={STAFF_ROLES} />}>
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requests" element={<RequestQueue />} />
          <Route path="reservations" element={<Reservations />} />
          <Route element={<RequireAuth roles={ADMIN_ROLES} />}>
            <Route path="tables" element={<TableManagement />} />
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

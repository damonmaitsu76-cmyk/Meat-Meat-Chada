import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import { STAFF_ROLES } from './auth/roles.js'
import Login from './pages/Login.jsx'
import QRMenu from './pages/QRMenu.jsx'
import RequestQueue from './pages/staff/RequestQueue.jsx'
import StaffLayout from './pages/staff/StaffLayout.jsx'

function Message({ title, text }) {
  return (
    <div className="center-screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* customers (no login) */}
      <Route
        path="/"
        element={
          <Message
            title="Meat Me at Chada"
            text="Please scan the QR code on your table to open the menu."
          />
        }
      />
      <Route path="/menu/:qrToken" element={<QRMenu />} />

      {/* staff, manager, owner */}
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth roles={STAFF_ROLES} />}>
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<Navigate to="requests" replace />} />
          <Route path="requests" element={<RequestQueue />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Message title="Page not found" text="Please scan the QR code on your table." />}
      />
    </Routes>
  )
}

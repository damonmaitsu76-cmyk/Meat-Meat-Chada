import { Routes, Route } from 'react-router-dom'
import QRMenu from './pages/QRMenu.jsx'

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
      <Route
        path="*"
        element={<Message title="Page not found" text="Please scan the QR code on your table." />}
      />
    </Routes>
  )
}

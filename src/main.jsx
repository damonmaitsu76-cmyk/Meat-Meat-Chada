import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import './styles/tokens.css'
import './styles/global.css'
import './styles/shared.css'
import './styles/components.css'
import App from './App.jsx'
import DialogHost from './components/DialogHost.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import { currentSide } from './lib/hosts.js'
import Blocked from './pages/Blocked.jsx'

// On an address that is neither the guest nor the staff address, show the retired-address page
// alone: no router, no sign-in, no database calls.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {currentSide() === 'blocked' ? (
      <Blocked />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
          <DialogHost />
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>
)

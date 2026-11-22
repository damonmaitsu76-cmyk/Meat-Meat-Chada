import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import App from './App.jsx'
import DialogHost from './components/DialogHost.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import './styles/tokens.css'
import './styles/global.css'
import './styles/shared.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <DialogHost />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)

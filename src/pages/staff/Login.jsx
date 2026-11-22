import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.js'
import { homeFor } from '../../auth/roles.js'
import { Field } from '../../components/ui.jsx'
import '../../styles/staff.css'

export default function Login() {
  const { profile, loading, authMessage, signIn } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already logged in (or just logged in): go to the page the user wanted, or their home page.
  if (!loading && profile) {
    return <Navigate to={location.state?.from || homeFor(profile.role)} replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const message = await signIn(username, password)
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Samgyup Chada</h1>
        <p className="hint">Staff login</p>

        <Field label="Username" type="text" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

        {(error || authMessage) && <p className="error" role="alert">{error || authMessage}</p>}

        <button className="btn full" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}

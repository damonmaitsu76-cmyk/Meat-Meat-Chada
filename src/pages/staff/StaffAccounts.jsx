import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { useAuth } from '../../auth/AuthContext.js'
import { ROLES, ROLE_LABEL } from '../../auth/roles.js'
import './StaffAccounts.css'

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/ // same rule as the manage-staff function

function passwordProblem(password) {
  return password.length < 8 || password.length > 72
    ? 'The password must be 8 to 72 characters long.'
    : ''
}

// Calls the manage-staff Edge Function. Returns '' on success, or a message to show.
async function callManageStaff(body) {
  const { error } = await supabase.functions.invoke('manage-staff', { body })
  if (!error) return ''
  try {
    const reply = await error.context.json()
    if (reply?.error) return reply.error
  } catch {
    // no readable reply (network problem, or the function is not deployed)
  }
  return 'Could not reach the account service. Check that the manage-staff function is deployed.'
}

/* ------------------------------------------------------------------ */
/* Set a new password for one account                                  */
/* ------------------------------------------------------------------ */
function ResetModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    const message = await callManageStaff({
      action: 'reset_password',
      user_id: user.user_id,
      password,
    })
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    onDone(`New password saved for ${user.username}.`)
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`New password for ${user.username}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-head">
          <h2>New password</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <span className="dim">Account: {user.username}</span>

        <label className="field" style={{ marginTop: 14 }}>
          <span>New password (8 to 72 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn full" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function StaffAccounts() {
  const { profile } = useAuth()
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('') // problems loading the list
  const [actionError, setActionError] = useState('') // problems with a button press; a reload must not clear it
  const [info, setInfo] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [resetFor, setResetFor] = useState(null)

  const load = useCallback(
    () =>
      supabase
        .from('users')
        .select('user_id, username, role, status, created_at')
        .order('username')
        .then(({ data, error }) => {
          if (error) setError(error.message)
          else {
            setUsers(data)
            setError('')
          }
        }),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  const closeReset = useCallback(() => setResetFor(null), [])

  async function createAccount(e) {
    e.preventDefault()
    const username = newUsername.trim().toLowerCase()
    const problem = USERNAME_RE.test(username)
      ? passwordProblem(newPassword)
      : 'The username must be 3 to 30 letters, numbers, dots, dashes, or underscores.'
    if (problem) {
      setInfo('')
      setActionError(problem)
      return
    }
    setCreating(true)
    const message = await callManageStaff({
      action: 'create',
      username,
      password: newPassword,
      role: newRole,
    })
    setCreating(false)
    if (message) {
      setInfo('')
      setActionError(message)
      return
    }
    setActionError('')
    setInfo(`Account ${username} created. Give them the username and the password.`)
    setNewUsername('')
    setNewPassword('')
    load()
  }

  // Role and status are plain edits of the users row; the database rules decide if they are allowed.
  async function updateUser(u, changes, okMessage) {
    setBusyId(u.user_id)
    setInfo('')
    const { data, error } = await supabase
      .from('users')
      .update(changes)
      .eq('user_id', u.user_id)
      .select('user_id')
    setBusyId(null)
    if (error || data.length === 0) {
      setActionError(error ? error.message : 'The change was not saved. Check your account role.')
      load()
      return
    }
    setActionError('')
    setInfo(okMessage)
    load()
  }

  function changeRole(u, role) {
    if (role === u.role) return
    if (!window.confirm(`Change ${u.username} to ${ROLE_LABEL[role]}?`)) return
    updateUser(u, { role }, `${u.username} is now ${ROLE_LABEL[role]}.`)
  }

  function changeStatus(u) {
    const deactivate = u.status === 'active'
    if (
      deactivate &&
      !window.confirm(`Deactivate ${u.username}? They are logged out and cannot log in again.`)
    ) {
      return
    }
    updateUser(
      u,
      { status: deactivate ? 'inactive' : 'active' },
      `${u.username} ${deactivate ? 'deactivated' : 'reactivated'}.`
    )
  }

  const list = users || []

  return (
    <>
      <div className="page-head">
        <h1>Staff accounts</h1>
      </div>

      <form className="acc-add" onSubmit={createAccount}>
        <label className="field">
          <span>Username</span>
          <input
            type="text"
            autoCapitalize="none"
            autoComplete="off"
            maxLength={30}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="acc-help">
        Usernames are 3 to 30 letters, numbers, dots, dashes, or underscores. Passwords are 8 to 72
        characters. People cannot change their own password yet, so if someone forgets it, use
        Reset password. A deactivated account loses access right away and is logged out within
        about a minute. You cannot change your own role or deactivate yourself.
      </p>

      {info && <div className="success">{info}</div>}
      {(actionError || error) && <p className="error">{actionError || error}</p>}
      {users === null && !error && <p className="hint">Loading…</p>}

      {users && (
        <table className="q-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const me = u.user_id === profile.user_id
              const busy = busyId === u.user_id
              const active = u.status === 'active'
              return (
                <tr key={u.user_id} className={active ? '' : 'acc-off'}>
                  <td data-label="Username">
                    <strong>{u.username}</strong>
                    {me && <span className="acc-you">you</span>}
                  </td>
                  <td data-label="Role">
                    <select
                      className="acc-select"
                      aria-label={`Role of ${u.username}`}
                      value={u.role}
                      disabled={me || busy}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Status">
                    <span className={`acc-state ${active ? 'on' : ''}`}>
                      {active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td data-label="Action">
                    <div className="acc-actions">
                      <button
                        className="btn small secondary"
                        disabled={busy}
                        onClick={() => setResetFor(u)}
                      >
                        Reset password
                      </button>
                      {!me && (
                        <button
                          className="btn small secondary"
                          disabled={busy}
                          onClick={() => changeStatus(u)}
                        >
                          {active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {resetFor && (
        <ResetModal
          key={resetFor.user_id}
          user={resetFor}
          onClose={closeReset}
          onDone={(message) => {
            setResetFor(null)
            setActionError('')
            setInfo(message)
          }}
        />
      )}
    </>
  )
}

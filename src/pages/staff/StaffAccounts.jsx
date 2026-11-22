import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import Modal from '../../components/Modal.jsx'
import { confirmDialog } from '../../components/dialogs.js'
import { Disclosure, Field, Notice, PageToolbar, RadioCards, RecordCard, ResponsiveRecords, StatusChip } from '../../components/ui.jsx'
import { useAuth } from '../../auth/AuthContext.js'
import { ROLE_LABEL } from '../../auth/roles.js'
import './StaffAccounts.css'

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/ // same rule as the manage-staff function
const ROLE_OPTIONS = [
  { key: 'staff', label: 'Staff', description: 'Dashboard, requests, reservations, and dish availability.' },
  { key: 'admin', label: 'Manager', description: 'Everything staff can do, plus tables, import, reports, accounts, and settings.' },
]

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

function CreateAccountModal({ creating, onClose, onCreate }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('staff')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const message = await onCreate({ username, password, role })
    if (message) setError(message)
    else onClose()
  }

  return (
    <Modal title="Create account" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Username" hint="3–30 letters, numbers, dots, dashes or underscores" type="text" autoCapitalize="none" autoComplete="off" maxLength={30} autoFocus value={username} onChange={(event) => setUsername(event.target.value)} />
        <Field label="Password" hint="8–72 characters" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="field"><span>Role</span><RadioCards label="Role" items={ROLE_OPTIONS} value={role} onChange={setRole} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn full" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
      </form>
    </Modal>
  )
}

function RoleModal({ user, busy, onClose, onChange }) {
  const [role, setRole] = useState(user.role)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const message = await onChange(user, role)
    if (message) setError(message)
    else onClose()
  }

  return (
    <Modal title={`Role for ${user.username}`} onClose={onClose}>
      <form onSubmit={submit}>
        <RadioCards label={`Role for ${user.username}`} items={ROLE_OPTIONS} value={role} onChange={setRole} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn full" type="submit" disabled={role === user.role || busy}>Change role</button>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Set a new password for one account                                  */
/* ------------------------------------------------------------------ */
function ResetModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')


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
    <Modal title="New password" onClose={onClose}>
      <form onSubmit={submit}>
        <span className="dim">Account: {user.username}</span>

        <Field label="New password" hint="8–72 characters" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
        <button className="btn full" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </Modal>
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
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [resetFor, setResetFor] = useState(null)
  const [roleFor, setRoleFor] = useState(null)

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

  async function createAccount({ username: inputUsername, password, role }) {
    const username = inputUsername.trim().toLowerCase()
    const problem = USERNAME_RE.test(username)
      ? passwordProblem(password)
      : 'The username must be 3 to 30 letters, numbers, dots, dashes, or underscores.'
    if (problem) {
      setInfo('')
      return problem
    }
    setCreating(true)
    const message = await callManageStaff({
      action: 'create',
      username,
      password,
      role,
    })
    setCreating(false)
    if (message) {
      setInfo('')
      return message
    }
    setActionError('')
    setInfo(`Account ${username} created. Give them the username and the password.`)
    load()
    return ''
  }

  // Role and status are plain edits of the users row; the database rules decide if they are allowed.
  async function updateUser(u, changes, okMessage, reportError = true) {
    setBusyId(u.user_id)
    setInfo('')
    const { data, error } = await supabase
      .from('users')
      .update(changes)
      .eq('user_id', u.user_id)
      .select('user_id')
    setBusyId(null)
    if (error || data.length === 0) {
      const message = error ? error.message : 'The change was not saved. Check your account role.'
      if (reportError) setActionError(message)
      load()
      return message
    }
    setActionError('')
    setInfo(okMessage)
    load()
    return ''
  }

  async function changeRole(u, role) {
    if (role === u.role) return ''
    return updateUser(u, { role }, `${u.username} is now ${ROLE_LABEL[role]}.`, false)
  }

  async function changeStatus(u) {
    const deactivate = u.status === 'active'
    if (
      deactivate &&
      !(await confirmDialog({
        title: `Deactivate ${u.username}?`,
        message: 'They are logged out and cannot log in again.',
        confirmLabel: 'Deactivate',
        danger: true,
      }))
    ) {
      return
    }
    updateUser(
      u,
      { status: deactivate ? 'inactive' : 'active' },
      `${u.username} ${deactivate ? 'deactivated' : 'reactivated'}.`
    )
  }

  function openRole(user) {
    setActionError('')
    setInfo('')
    setRoleFor(user)
  }

  const list = users || []

  function userActions(user, me) {
    const busy = busyId === user.user_id
    return <div className="acc-actions">
      {!me && <button className="btn ghost small" type="button" disabled={busy} onClick={() => openRole(user)}>Change role</button>}
      <button className="btn ghost small" type="button" disabled={busy} onClick={() => setResetFor(user)}>Reset password</button>
      {!me && <button className={`btn ghost small ${user.status === 'active' ? 'acc-deactivate' : ''}`} type="button" disabled={busy} onClick={() => changeStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>}
    </div>
  }

  const records = list.map((user) => {
    const me = user.user_id === profile.user_id
    const inactive = user.status !== 'active'
    const username = <span className="acc-username"><strong>{user.username}</strong>{me && <span className="acc-you">· You</span>}{inactive && <StatusChip status="muted">Deactivated</StatusChip>}</span>
    const role = <span className="acc-role">{ROLE_LABEL[user.role]}</span>
    const actions = userActions(user, me)
    const card = <RecordCard title={username} actions={actions}><span className="acc-role">{ROLE_LABEL[user.role]}</span></RecordCard>
    return { key: user.user_id, card, cells: [username, role, actions] }
  })

  return (
    <>
      <PageToolbar title="Staff accounts" action={<button className="btn" type="button" onClick={() => { setInfo(''); setActionError(''); setCreateOpen(true) }}>Create account</button>} />
      {info && <div className="success">{info}</div>}
      {(actionError || error) && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={load}>Try again</button>}>{actionError || error}</Notice>}
      {users === null && !error && <p className="hint">Loading accounts…</p>}
      {users && records.length === 0 && <p className="empty-state">No staff accounts yet.</p>}
      {users && records.length > 0 && <ResponsiveRecords className="account-records" headers={['Username', 'Role', 'Actions']} records={records} />}

      <Disclosure label="How accounts work" className="acc-policy">
        <p>Usernames use 3–30 letters, numbers, dots, dashes or underscores. Passwords are 8–72 characters. Staff cannot change their own password yet, so use Reset password if they forget it. Deactivated accounts lose access and are logged out within about a minute. You cannot change your own role or deactivate yourself.</p>
      </Disclosure>

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
      {createOpen && <CreateAccountModal creating={creating} onClose={() => setCreateOpen(false)} onCreate={createAccount} />}
      {roleFor && <RoleModal key={`${roleFor.user_id}-${roleFor.role}`} user={roleFor} busy={busyId === roleFor.user_id} onClose={() => setRoleFor(null)} onChange={changeRole} />}
    </>
  )
}

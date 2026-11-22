import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import Modal from '../../components/Modal.jsx'
import { confirmDialog } from '../../components/dialogs.js'
import { Disclosure, Field, Notice, PageToolbar, RecordCard, ResponsiveRecords, Segmented, StatusChip } from '../../components/ui.jsx'
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
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [resetFor, setResetFor] = useState(null)
  const [roleEditId, setRoleEditId] = useState(null)

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

  async function changeRole(u, role) {
    if (role === u.role) return
    const ok = await confirmDialog({
      title: `Change ${u.username} to ${ROLE_LABEL[role]}?`,
      confirmLabel: 'Change role',
    })
    if (!ok) return
    await updateUser(u, { role }, `${u.username} is now ${ROLE_LABEL[role]}.`)
    setRoleEditId(null)
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

  const list = users || []

  function roleControl(user) {
    if (roleEditId !== user.user_id) return <span>{ROLE_LABEL[user.role]}</span>
    return <div className="account-role">
      <Segmented label={`Role of ${user.username}`} items={ROLES.map((role) => ({ key: role, label: ROLE_LABEL[role] }))} value={user.role} disabled={busyId === user.user_id} onChange={(role) => changeRole(user, role)} />
      <button className="btn ghost small" type="button" onClick={() => setRoleEditId(null)}>Cancel</button>
    </div>
  }

  function userActions(user, me) {
    const busy = busyId === user.user_id
    return <div className="acc-actions">
      {!me && roleEditId !== user.user_id && <button className="btn ghost small" type="button" disabled={busy} onClick={() => setRoleEditId(user.user_id)}>Change role</button>}
      <button className="btn ghost small" type="button" disabled={busy} onClick={() => setResetFor(user)}>Reset password</button>
      {!me && <button className={`btn ghost small ${user.status === 'active' ? 'acc-deactivate' : ''}`} type="button" disabled={busy} onClick={() => changeStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>}
    </div>
  }

  const records = list.map((user) => {
    const me = user.user_id === profile.user_id
    const inactive = user.status !== 'active'
    const username = <span className="acc-username"><strong>{user.username}{me && <span className="acc-you"> · You</span>}</strong>{inactive && <StatusChip status="muted">Deactivated</StatusChip>}</span>
    const role = roleControl(user)
    const card = <RecordCard title={<span className="acc-username"><span>{user.username}{me && <span className="acc-you"> · You</span>}</span>{inactive && <StatusChip status="muted">Deactivated</StatusChip>}</span>} actions={userActions(user, me)}><div className="account-role">{role}</div></RecordCard>
    return { key: user.user_id, card, cells: [username, role, userActions(user, me)] }
  })

  return (
    <>
      <PageToolbar title="Staff accounts" action={<Disclosure label="Create account" className="acc-create-disclosure disclosure-button">
        <form className="acc-add" onSubmit={createAccount}>
          <Field label="Username" hint="3–30 letters, numbers, dots, dashes or underscores" type="text" autoCapitalize="none" autoComplete="off" maxLength={30} value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
          <Field label="Password" hint="8–72 characters" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <div className="field"><span>Role</span><Segmented label="Role" items={ROLES.map((role) => ({ key: role, label: ROLE_LABEL[role] }))} value={newRole} onChange={setNewRole} /></div>
          <button className="btn" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
        </form>
      </Disclosure>} />
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
    </>
  )
}

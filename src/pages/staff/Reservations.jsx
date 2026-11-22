import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { promptDialog } from '../../components/dialogs.js'
import { dayLabel, fmtTime, manilaDate, shiftDate, startMs } from '../../lib/dates.js'
import './Reservations.css'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'history', label: 'History' },
]
const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
  arrived: 'Arrived',
  auto_cancelled: 'No-show',
}
const OPEN_STATUSES = ['pending', 'approved']
const HISTORY_DAYS = 7 // how far back the History filter looks
const NOTICE_HOURS = 2 // how long a released no-show stays in the notice box
const SAFETY_POLL_MS = 30000 // in case the live connection silently drops

let channelSeq = 0

export default function Reservations() {
  const [rows, setRows] = useState(null)
  const [tables, setTables] = useState([])
  const [error, setError] = useState('') // problems loading the list
  const [actionError, setActionError] = useState('') // problems with a button press; a reload must not clear it
  const [info, setInfo] = useState('')
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState({}) // { [reservation_id]: table_id chosen by staff }
  const [busyId, setBusyId] = useState(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Pending and approved bookings of any date, plus everything else from the last few days.
  const load = useCallback(() => {
    const since = shiftDate(manilaDate(), -HISTORY_DAYS)
    return supabase
      .from('reservations')
      .select(
        'reservation_id, reservation_code, customer_name, contact_number, guest_count, ' +
          'reservation_date, reservation_time, status, updated_at, restaurant_tables(table_number)'
      )
      .or(`status.in.(pending,approved),reservation_date.gte.${since}`)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          setRows(data)
          setError('')
        }
      })
  }, [])

  // Load, then stay up to date: Supabase Realtime pushes a change, we reload the list.
  useEffect(() => {
    load()
    const channel = supabase
      .channel(`reservations-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, SAFETY_POLL_MS)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [load])

  // The tables staff can pick from when approving.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('restaurant_tables')
      .select('table_id, table_number, capacity')
      .eq('is_active', true)
      .order('table_number')
      .then(({ data }) => {
        if (!cancelled && data) setTables(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-draw "today", "time passed", and the notice box every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  // Runs one staff action (approve, decline, arrival), shows the result, and reloads the list.
  async function act(r, call, message) {
    setBusyId(r.reservation_id)
    const { data, error } = await call()
    setBusyId(null)
    setActionError(error ? error.message : '')
    setInfo(error ? '' : message(data))
    load() // also refreshes the list if someone else already changed it
  }

  function approve(r) {
    const picked = choice[r.reservation_id]
    act(
      r,
      () =>
        supabase.rpc('approve_reservation', {
          p_reservation_id: r.reservation_id,
          p_table_id: picked ? Number(picked) : null, // null = the smallest free table that fits
        }),
      (d) => `Approved ${d.reservation_code}: Table ${d.table_number}.`
    )
  }

  async function decline(r) {
    const reason = await promptDialog({
      title: `Decline ${r.reservation_code}`,
      label: 'Reason shown to the customer (optional)',
      confirmLabel: 'Decline',
    })
    if (reason === null) return // staff pressed Cancel
    act(
      r,
      () =>
        supabase.rpc('decline_reservation', {
          p_reservation_id: r.reservation_id,
          p_reason: reason,
        }),
      () => `Declined ${r.reservation_code}.`
    )
  }

  async function cancel(r) {
    const reason = await promptDialog({
      title: `Cancel ${r.reservation_code}`,
      label: 'Reason (optional)',
      confirmLabel: 'Cancel reservation',
      cancelLabel: 'Keep it',
    })
    if (reason === null) return // staff pressed Cancel
    act(
      r,
      () =>
        supabase.rpc('staff_cancel_reservation', {
          p_reservation_id: r.reservation_id,
          p_reason: reason,
        }),
      () => `Cancelled ${r.reservation_code}.`
    )
  }

  function arrive(r) {
    act(
      r,
      () => supabase.rpc('confirm_arrival', { p_code: r.reservation_code, p_table_id: null }),
      (d) => `${r.customer_name} seated at Table ${d.table_number}.`
    )
  }

  const all = rows || []
  const today = manilaDate(new Date(now))
  const q = search.trim().toLowerCase()

  const matchesFilter = (r, key) =>
    key === 'history' ? !OPEN_STATUSES.includes(r.status) : r.status === key
  const count = (key) => all.filter((r) => matchesFilter(r, key)).length

  // A search looks through every status, so staff can find an ID whatever its state.
  let visible = q
    ? all.filter((r) =>
        [r.reservation_code, r.customer_name, r.contact_number].some((v) =>
          v.toLowerCase().includes(q)
        )
      )
    : all.filter((r) => matchesFilter(r, filter))
  if (!q && filter === 'history') visible = visible.slice().reverse() // newest first

  const noShows = all.filter(
    (r) =>
      r.status === 'auto_cancelled' &&
      now - new Date(r.updated_at).getTime() < NOTICE_HOURS * 3600 * 1000
  )

  return (
    <>
      <div className="page-head">
        <h1>Reservations</h1>
        <span className={`live ${live ? 'on' : ''}`}>{live ? '● Live' : '○ Reconnecting…'}</span>
      </div>

      {noShows.length > 0 && (
        <div className="notice" role="status">
          <strong>Released after the grace period (no-show)</strong>
          <ul>
            {noShows.map((r) => (
              <li key={r.reservation_id}>
                {r.customer_name} ({r.reservation_code}), booked for{' '}
                {fmtTime(r.reservation_time)}
                {r.restaurant_tables ? `, Table ${r.restaurant_tables.table_number} released` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        className="search"
        type="search"
        placeholder="Search by ID, name, or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${!q && filter === f.key ? 'active' : ''}`}
            onClick={() => {
              setSearch('')
              setFilter(f.key)
            }}
          >
            {f.label} ({count(f.key)})
          </button>
        ))}
      </div>

      {info && <div className="success">{info}</div>}
      {(actionError || error) && <p className="error">{actionError || error}</p>}
      {rows === null && !error && <p className="hint">Loading…</p>}
      {rows && visible.length === 0 && (
        <p className="empty-state">
          {q ? 'No reservation matches your search.' : 'Nothing here.'}
        </p>
      )}

      {visible.length > 0 && (
        <table className="q-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Guest</th>
              <th>Party</th>
              <th>When</th>
              <th>Table</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const passed = startMs(r.reservation_date, r.reservation_time) < now
              const late = r.status === 'pending' && passed
              const busy = busyId === r.reservation_id
              const fits = tables.filter((t) => t.capacity >= r.guest_count)
              const tableNo = r.restaurant_tables?.table_number
              return (
                <tr key={r.reservation_id} className={late ? 'late' : ''}>
                  <td data-label="ID">
                    <strong>{r.reservation_code}</strong>
                  </td>
                  <td data-label="Guest">
                    <div>
                      {r.customer_name}
                      <span className="sub">{r.contact_number}</span>
                    </div>
                  </td>
                  <td data-label="Party">{r.guest_count}</td>
                  <td data-label="When">
                    <div>
                      {dayLabel(r.reservation_date, today)}
                      <span className="sub">
                        {fmtTime(r.reservation_time)}
                        {late ? ' · time passed' : ''}
                      </span>
                    </div>
                  </td>
                  <td data-label="Table">{tableNo ? `Table ${tableNo}` : '—'}</td>
                  <td data-label="Status">
                    <span className={`tag ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td data-label="Action">
                    {r.status === 'pending' && (
                      <div className="row-actions">
                        <select
                          aria-label="Table for this reservation"
                          value={choice[r.reservation_id] ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            setChoice((c) => ({ ...c, [r.reservation_id]: e.target.value }))
                          }
                        >
                          <option value="">Auto table</option>
                          {fits.map((t) => (
                            <option key={t.table_id} value={t.table_id}>
                              Table {t.table_number} (seats {t.capacity})
                            </option>
                          ))}
                        </select>
                        <button className="btn small" disabled={busy} onClick={() => approve(r)}>
                          Approve
                        </button>
                        <button
                          className="btn small secondary"
                          disabled={busy}
                          onClick={() => decline(r)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <div className="row-actions">
                        {r.reservation_date === today ? (
                          <button className="btn small" disabled={busy} onClick={() => arrive(r)}>
                            Confirm arrival
                          </button>
                        ) : (
                          <span className="sub">Not for today</span>
                        )}
                        <button
                          className="btn small secondary"
                          disabled={busy}
                          onClick={() => cancel(r)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

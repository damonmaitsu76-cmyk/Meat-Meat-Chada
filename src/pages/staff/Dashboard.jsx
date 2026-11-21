import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'
import { fmtTime, manilaDate } from '../../lib/dates.js'
import './dashboard.css'

const STATUS_LABEL = { available: 'Available', reserved: 'Reserved', dining: 'Dining' }
const NOTICE_HOURS = 2 // how long a released no-show stays in the notice box
const SAFETY_POLL_MS = 30000 // in case the live connection silently drops
const WATCHED_TABLES = ['restaurant_tables', 'dining_sessions', 'reservations', 'refill_requests']

let channelSeq = 0

function sinceText(iso, now) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/* ------------------------------------------------------------------ */
/* Panel that opens when a table is clicked                            */
/* ------------------------------------------------------------------ */
function TablePanel({ table, session, bookings, requestCount, now, onClose, onDone }) {
  const [name, setName] = useState('')
  const [party, setParty] = useState('2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Runs one staff action. Errors stay inside the panel; success closes it.
  async function run(call, message) {
    setBusy(true)
    setError('')
    const { data, error } = await call()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onDone(message(data))
  }

  function seatWalkIn(e) {
    e.preventDefault()
    const size = Number(party)
    if (!name.trim()) {
      setError('Enter the guest name.')
      return
    }
    if (!Number.isInteger(size) || size < 1) {
      setError('Enter a party size of 1 or more.')
      return
    }
    run(
      () =>
        supabase.rpc('record_walkin', {
          p_name: name.trim(),
          p_party_size: size,
          p_table_id: table.table_id,
        }),
      () => `${name.trim()} seated at Table ${table.table_number}.`
    )
  }

  const nextBooking = bookings[0]
  const partyNum = Number(party)
  const tooBig = Number.isInteger(partyNum) && partyNum > table.capacity
  // A table that is "dining" with a session can only be freed by ending the session.
  const canOverride = table.status !== 'dining' || !session
  const overrideTo = table.status === 'available' ? 'reserved' : 'available'

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Table ${table.table_number}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Table {table.table_number}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <span className="dim">
          Seats {table.capacity} · {STATUS_LABEL[table.status]}
          {requestCount > 0 ? ` · ${requestCount} open request${requestCount > 1 ? 's' : ''}` : ''}
        </span>

        {session && (
          <section className="panel-section">
            <h3>Seated now</h3>
            <p style={{ margin: '0 0 10px' }}>
              <strong>{session.guest_name}</strong>, party of {session.party_size}
              <span className="dim">
                {session.source === 'walk_in' ? 'Walk-in' : 'Reservation'} · seated{' '}
                {sinceText(session.seated_at, now)} ago
              </span>
            </p>
            <button
              className="btn full"
              disabled={busy}
              onClick={() =>
                run(
                  () => supabase.rpc('end_session', { p_session_id: session.session_id }),
                  () => `Table ${table.table_number} is free again.`
                )
              }
            >
              End session
            </button>
          </section>
        )}

        {bookings.length > 0 && (
          <section className="panel-section">
            <h3>Booked today</h3>
            <ul className="panel-list">
              {bookings.map((b) => (
                <li key={b.reservation_id}>
                  <div>
                    <strong>{b.customer_name}</strong> ({b.reservation_code})
                    <span className="dim">
                      {b.guest_count} guests · {fmtTime(b.reservation_time)}
                    </span>
                  </div>
                  {table.status !== 'dining' && (
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            supabase.rpc('confirm_arrival', {
                              p_code: b.reservation_code,
                              p_table_id: table.table_id,
                            }),
                          () => `${b.customer_name} seated at Table ${table.table_number}.`
                        )
                      }
                    >
                      Confirm arrival
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {table.status === 'available' && (
          <form className="panel-section" onSubmit={seatWalkIn}>
            <h3>Seat a walk-in</h3>
            {nextBooking && (
              <p className="hint">
                This table is booked for {fmtTime(nextBooking.reservation_time)} today.
              </p>
            )}
            <label className="field">
              <span>Guest name</span>
              <input
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Party size</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={party}
                onChange={(e) => setParty(e.target.value)}
              />
            </label>
            {tooBig && <p className="hint">This table seats {table.capacity}.</p>}
            <button className="btn full" type="submit" disabled={busy}>
              Seat walk-in
            </button>
          </form>
        )}

        {canOverride && (
          <section className="panel-section">
            <button
              className="btn secondary full"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    supabase.rpc('set_table_status', {
                      p_table_id: table.table_id,
                      p_status: overrideTo,
                    }),
                  () => `Table ${table.table_number} marked ${overrideTo}.`
                )
              }
            >
              Mark as {overrideTo}
            </button>
          </section>
        )}

        {error && (
          <p className="error" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const [data, setData] = useState(null) // { tables, sessions, reservations, requests }
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const reloadTimer = useRef(null)

  const load = useCallback(async () => {
    const noticeSince = new Date(Date.now() - NOTICE_HOURS * 3600 * 1000).toISOString()
    const [t, s, r, q] = await Promise.all([
      supabase
        .from('restaurant_tables')
        .select('table_id, table_number, capacity, status')
        .eq('is_active', true)
        .order('table_number'),
      supabase
        .from('dining_sessions')
        .select('session_id, table_id, guest_name, party_size, source, seated_at')
        .eq('status', 'seated'),
      supabase
        .from('reservations')
        .select(
          'reservation_id, reservation_code, customer_name, guest_count, reservation_date, ' +
            'reservation_time, status, table_id, updated_at'
        )
        .or(
          `status.in.(pending,approved),and(status.eq.auto_cancelled,updated_at.gte.${noticeSince})`
        ),
      supabase
        .from('refill_requests')
        .select('request_id, table_id, status')
        .in('status', ['sent', 'accepted', 'ready']),
    ])
    const failed = [t, s, r, q].find((x) => x.error)
    if (failed) {
      setError(failed.error.message)
      return
    }
    setData({ tables: t.data, sessions: s.data, reservations: r.data, requests: q.data })
    setError('')
  }, [])

  // Several changes often arrive together, so wait a moment and reload once.
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(load, 250)
  }, [load])

  useEffect(() => {
    load()
    let channel = supabase.channel(`dashboard-${++channelSeq}`)
    for (const table of WATCHED_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, reloadSoon)
    }
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, SAFETY_POLL_MS)
    return () => {
      clearInterval(poll)
      clearTimeout(reloadTimer.current)
      supabase.removeChannel(channel)
    }
  }, [load, reloadSoon])

  // Re-draw "seated 20 min ago" and the notice box every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const closePanel = useCallback(() => setSelectedId(null), [])

  function onDone(message) {
    setInfo(message)
    setSelectedId(null)
    load()
  }

  const tables = data?.tables || []
  const sessions = data?.sessions || []
  const reservations = data?.reservations || []
  const requests = data?.requests || []
  const today = manilaDate(new Date(now))

  const tablesById = {}
  for (const t of tables) tablesById[t.table_id] = t

  const sessionByTable = {}
  for (const s of sessions) sessionByTable[s.table_id] = s

  const requestCountByTable = {}
  for (const r of requests) requestCountByTable[r.table_id] = (requestCountByTable[r.table_id] || 0) + 1

  // Approved bookings for today that have not arrived yet, earliest first, grouped by table.
  const bookingsByTable = {}
  for (const r of reservations) {
    if (r.status === 'approved' && r.reservation_date === today && r.table_id) {
      ;(bookingsByTable[r.table_id] ||= []).push(r)
    }
  }
  for (const list of Object.values(bookingsByTable)) {
    list.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time))
  }

  const noShows = reservations.filter(
    (r) =>
      r.status === 'auto_cancelled' &&
      now - new Date(r.updated_at).getTime() < NOTICE_HOURS * 3600 * 1000
  )
  const pendingCount = reservations.filter((r) => r.status === 'pending').length
  const occupied = tables.filter((t) => t.status === 'dining').length
  const guestsDining = sessions.reduce((sum, s) => sum + s.party_size, 0)

  const selected = tables.find((t) => t.table_id === selectedId) || null

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className={`live ${live ? 'on' : ''}`}>{live ? '● Live' : '○ Reconnecting…'}</span>
      </div>

      {info && <div className="success">{info}</div>}
      {error && <p className="error">{error}</p>}
      {data === null && !error && <p className="hint">Loading…</p>}

      {data && (
        <>
          <div className="stats">
            <Link className="stat" to="/staff/requests">
              <span className="stat-num">{requests.length}</span>
              <span className="stat-label">Active requests</span>
            </Link>
            <div className="stat">
              <span className="stat-num">
                {occupied}/{tables.length}
              </span>
              <span className="stat-label">Occupied tables</span>
            </div>
            <Link className="stat" to="/staff/reservations">
              <span className="stat-num">{pendingCount}</span>
              <span className="stat-label">Awaiting approval</span>
            </Link>
            <div className="stat">
              <span className="stat-num">{guestsDining}</span>
              <span className="stat-label">Guests dining</span>
            </div>
          </div>

          {noShows.length > 0 && (
            <div className="dash-notice" role="status">
              <strong>Released after the grace period (no-show)</strong>
              <ul>
                {noShows.map((r) => (
                  <li key={r.reservation_id}>
                    {r.customer_name} ({r.reservation_code}), booked for{' '}
                    {fmtTime(r.reservation_time)}
                    {tablesById[r.table_id] ? `, Table ${tablesById[r.table_id].table_number} released` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="legend">
            <span className="available">Available</span>
            <span className="reserved">Reserved</span>
            <span className="dining">Dining</span>
          </div>

          {tables.length === 0 && <p className="empty-state">No tables yet.</p>}

          <div className="floor">
            {tables.map((t) => {
              const session = sessionByTable[t.table_id]
              const booking = (bookingsByTable[t.table_id] || [])[0]
              const reqCount = requestCountByTable[t.table_id] || 0
              return (
                <button
                  key={t.table_id}
                  className={`tile ${t.status}`}
                  onClick={() => setSelectedId(t.table_id)}
                >
                  <span className="tile-top">
                    <strong>Table {t.table_number}</strong>
                    <span className="tile-seats">{t.capacity} seats</span>
                  </span>
                  <span className={`tile-status ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  {session && (
                    <span className="tile-line">
                      {session.guest_name} · {session.party_size} · {sinceText(session.seated_at, now)}
                    </span>
                  )}
                  {!session && booking && (
                    <span className="tile-line">
                      {t.status === 'reserved' ? 'Held for' : 'Booked'} {booking.customer_name},{' '}
                      {fmtTime(booking.reservation_time)}
                    </span>
                  )}
                  {reqCount > 0 && (
                    <span className="tile-badge">
                      {reqCount} request{reqCount > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {selected && (
        <TablePanel
          key={selected.table_id}
          table={selected}
          session={sessionByTable[selected.table_id]}
          bookings={bookingsByTable[selected.table_id] || []}
          requestCount={requestCountByTable[selected.table_id] || 0}
          now={now}
          onClose={closePanel}
          onDone={onDone}
        />
      )}
    </>
  )
}

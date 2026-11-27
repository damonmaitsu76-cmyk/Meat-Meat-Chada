import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'
import Modal from '../../components/Modal.jsx'
import { Disclosure, Notice, PageToolbar } from '../../components/ui.jsx'
import { fmtTime, manilaDate } from '../../lib/dates.js'
import { DEFAULT_SLOT_MINUTES, minutesOver, minutesSince, plural } from '../../lib/floor.js'
import { displayName, formatDuration } from '../../lib/format.js'
import useDismissed, { noShowKey } from '../../lib/useDismissed.js'
import './Dashboard.css'
import AttentionList from './AttentionList.jsx'
import FloorMap from './FloorMap.jsx'

const NOTICE_HOURS = 2 // how long a released no-show stays in the notice box
const SAFETY_POLL_MS = 30000 // in case the live connection silently drops
const WATCHED_TABLES = ['restaurant_tables', 'dining_sessions', 'reservations', 'refill_requests']

let channelSeq = 0

function sinceText(iso, now) {
  return formatDuration(minutesSince(iso, now))
}

/* ------------------------------------------------------------------ */
/* Panel that opens when a table is clicked                            */
/* ------------------------------------------------------------------ */
function TablePanel({ table, session, bookings, slotMinutes, autoReleaseMinutes, now, onClose, onDone }) {
  const [name, setName] = useState('')
  const [party, setParty] = useState('2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef(null)

  // The window scrolls, and the error appears near its end, so bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [error])

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

  // A walk-in's name is optional: staff should not have to ask for it before seating anyone.
  function seatWalkIn(e) {
    e.preventDefault()
    const size = Number(party)
    if (!Number.isInteger(size) || size < 1) {
      setError('Enter a party size of 1 or more.')
      return
    }
    const guest = name.trim() || 'Walk-in'
    run(
      () =>
        supabase.rpc('record_walkin', {
          p_name: guest,
          p_party_size: size,
          p_table_id: table.table_id,
        }),
      () => `${guest} seated at Table ${table.table_number}.`
    )
  }

  const nextBooking = bookings[0]
  const partyNum = Number(party)
  const tooBig = Number.isInteger(partyNum) && partyNum > table.capacity
  // A table that is "dining" with a session can only be freed by ending the session.
  const canOverride = table.status !== 'dining' || !session
  const overrideTo = table.status === 'available' ? 'reserved' : 'available'
  const over = session ? minutesOver(session.seated_at, slotMinutes, now) : 0

  const walkInForm = (
    <form onSubmit={seatWalkIn}>
      {nextBooking && (
        <p className="hint">
          Booked for {fmtTime(nextBooking.reservation_time)} today. Walk-ins may not get this
          table before then.
        </p>
      )}
      <label className="field">
        <span>Guest name (optional)</span>
        <input
          type="text"
          maxLength={80}
          placeholder="Walk-in"
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
      <button className={`btn full ${bookings.length > 0 ? 'secondary' : ''}`.trim()} type="submit" disabled={busy}>
        Seat walk-in
      </button>
    </form>
  )

  return (
    <Modal title={`Table ${table.table_number}`} onClose={onClose}>
      <p className="panel-meta">
        Seats {table.capacity}
        {session || table.status === 'dining' ? ' · Dining' : table.status === 'reserved' ? ' · Reserved' : ''}
      </p>

      {session && (
        <section className="panel-section">
          <h3>Seated now</h3>
          <p className="panel-session-summary">
            <strong>{displayName(session.guest_name)}</strong>, party of {session.party_size}
            <span className="dim">
              {session.source === 'walk_in' ? 'Walk-in' : 'Reservation'}, seated{' '}
              {sinceText(session.seated_at, now)} ago
            </span>
            {over > 0 && (
              <span className="dim">
                {formatDuration(over)} past the {slotMinutes} minute time slot.
                {autoReleaseMinutes > 0 &&
                  ` It also frees itself once their last request is served and nothing new comes in for ${autoReleaseMinutes} min.`}
              </span>
            )}
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
            {bookings.map((b, index) => (
              <li key={b.reservation_id} className="panel-booking">
                <div>
                  <strong>{displayName(b.customer_name)}</strong>
                  <span className="dim">
                    <span className="ticket">{b.reservation_code}</span> · {plural(b.guest_count, 'guest', 'guests')} · {fmtTime(b.reservation_time)}
                  </span>
                </div>
                {table.status !== 'dining' && (
                  <button
                    className={`btn full ${index === 0 ? '' : 'secondary'}`.trim()}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          supabase.rpc('confirm_arrival', {
                            p_code: b.reservation_code,
                            p_table_id: table.table_id,
                          }),
                        () => `${displayName(b.customer_name)} seated at Table ${table.table_number}.`
                      )
                    }
                  >
                    Seat {displayName(b.customer_name)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {table.status === 'available' && (
        <section className="panel-section">
          {bookings.length > 0 ? (
            <Disclosure label="Seat a walk-in instead">{walkInForm}</Disclosure>
          ) : (
            <>
              <h3>Seat a walk-in</h3>
              {walkInForm}
            </>
          )}
        </section>
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
        <p ref={errorRef} className="error panel-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
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
  const navigate = useNavigate()
  const [dismissed, dismiss] = useDismissed()

  const load = useCallback(async () => {
    const noticeSince = new Date(Date.now() - NOTICE_HOURS * 3600 * 1000).toISOString()
    const [t, s, r, q, settings] = await Promise.all([
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
        .select('request_id, table_id, status, created_at')
        .in('status', ['sent', 'accepted', 'ready']),
      supabase.from('settings').select('setting_key, setting_value').in('setting_key', ['slot_length_minutes', 'auto_release_minutes']),
    ])
    const failed = [t, s, r, q].find((x) => x.error)
    if (failed) {
      setError(failed.error.message)
      return
    }
    // If a setting cannot be read, fall back to its default instead of blocking the floor.
    const setting = (key) => Number(settings.data?.find((row) => row.setting_key === key)?.setting_value)
    const slotMinutes = setting('slot_length_minutes') > 0 ? setting('slot_length_minutes') : DEFAULT_SLOT_MINUTES
    const autoReleaseMinutes = setting('auto_release_minutes') > 0 ? setting('auto_release_minutes') : 0
    setData({ tables: t.data, sessions: s.data, reservations: r.data, requests: q.data, slotMinutes, autoReleaseMinutes })
    setError('')
  }, [])

  // Several changes often arrive together, so wait a moment and reload once.
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(load, 250)
  }, [load])

  useEffect(() => {
    const initialLoad = setTimeout(load, 0)
    let channel = supabase.channel(`dashboard-${++channelSeq}`)
    for (const table of WATCHED_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, reloadSoon)
    }
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, SAFETY_POLL_MS)
    return () => {
      clearTimeout(initialLoad)
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
  const slotMinutes = data?.slotMinutes ?? DEFAULT_SLOT_MINUTES
  const autoReleaseMinutes = data?.autoReleaseMinutes ?? 0
  const today = manilaDate(new Date(now))

  const tablesById = {}
  for (const t of tables) tablesById[t.table_id] = t

  const sessionByTable = {}
  for (const s of sessions) sessionByTable[s.table_id] = s

  const requestCountByTable = {}
  for (const r of requests) requestCountByTable[r.table_id] = (requestCountByTable[r.table_id] || 0) + 1

  // A table with open requests goes straight to the queue; any other table opens its panel.
  function selectTable(tableId) {
    if (requestCountByTable[tableId] > 0) navigate('/staff/requests')
    else setSelectedId(tableId)
  }

  // Approved bookings for today that have not arrived yet, earliest first, grouped by table.
  const bookingsByTable = {}
  for (const r of reservations) {
    if (r.status === 'approved' && r.reservation_date === today && r.table_id) {
      ; (bookingsByTable[r.table_id] ||= []).push(r)
    }
  }
  for (const list of Object.values(bookingsByTable)) {
    list.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time))
  }

  const noShows = reservations.filter(
    (r) =>
      r.status === 'auto_cancelled' &&
      now - new Date(r.updated_at).getTime() < NOTICE_HOURS * 3600 * 1000 &&
      !dismissed.includes(noShowKey(r))
  )
  const pendingReservations = reservations.filter((r) => r.status === 'pending')

  const selected = tables.find((t) => t.table_id === selectedId) || null

  return (
    <>
      <PageToolbar title="Dashboard" live={live} />

      {info && <div className="success">{info}</div>}
      {error && <div className="load-error"><p className="error">{error}</p><button className="btn secondary small" type="button" onClick={load}>Try again</button></div>}
      {data === null && !error && <p className="hint">Loading floor…</p>}

      {data && (
        <div className="dash-grid">
          <aside className="dash-rail">
            <AttentionList
              requests={requests}
              pendingReservations={pendingReservations}
              tablesById={tablesById}
              today={today}
              now={now}
            />

            {noShows.length > 0 && (
              <Notice tone="warn" onDismiss={() => dismiss(noShows.map(noShowKey))}>
                <strong>Released after the grace period</strong>
                <ul>
                  {noShows.map((r) => (
                    <li key={r.reservation_id}>
                      {displayName(r.customer_name)} (<span className="ticket">{r.reservation_code}</span>), booked for{' '}
                      {fmtTime(r.reservation_time)}
                      {tablesById[r.table_id] ? `, Table ${tablesById[r.table_id].table_number} released` : ''}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
          </aside>

          <div className="dash-floor">
            <FloorMap
              tables={tables}
              sessionByTable={sessionByTable}
              bookingsByTable={bookingsByTable}
              requestCountByTable={requestCountByTable}
              slotMinutes={slotMinutes}
              now={now}
              onSelect={selectTable}
            />
          </div>
        </div>
      )}

      {selected && (
        <TablePanel
          key={selected.table_id}
          table={selected}
          session={sessionByTable[selected.table_id]}
          bookings={bookingsByTable[selected.table_id] || []}
          slotMinutes={slotMinutes}
          autoReleaseMinutes={autoReleaseMinutes}
          now={now}
          onClose={closePanel}
          onDone={onDone}
        />
      )}
    </>
  )
}

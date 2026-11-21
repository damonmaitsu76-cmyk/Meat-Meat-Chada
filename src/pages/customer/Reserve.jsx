import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { fmtDate, fmtTime, manilaDate, shiftDate } from '../../lib/dates.js'
import './Reserve.css'

const STORAGE_KEY = 'chada_reservation_code'
const POLL_MS = 5000 // how often a waiting customer's status refreshes
const MAX_DAYS_AHEAD = 60 // same limit as submit_reservation in the database

const STATUS = {
  pending: {
    label: 'Pending',
    text: 'We received your request. Staff will review it soon. Keep this page, or come back to it on this phone, to see the answer.',
  },
  approved: {
    label: 'Approved',
    text: 'Your table is confirmed. Show this reservation ID to the staff when you arrive. Please come on time: late bookings are released to other guests.',
  },
  declined: {
    label: 'Declined',
    text: 'We could not confirm this request. Try another date or time.',
  },
  cancelled: { label: 'Cancelled', text: 'This reservation was cancelled.' },
  arrived: { label: 'Arrived', text: 'Welcome to Samgyup Chada. Scan the QR code on your table to see the menu and ask for refills!' },
  auto_cancelled: {
    label: 'Released',
    text: 'This reservation was released because you did not arrive in time. You can make a new one.',
  },
}

// The ID is kept in this browser so a customer who closes the page can come back to it.
function readStoredCode() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function storeCode(code) {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // private browsing: the page still works, it just cannot remember the ID
  }
}

// Accept "ch-7k4m2x", " 7K4M2X " and "CH-7K4M2X".
function normalizeCode(raw) {
  const v = raw.trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9]{6}$/.test(v) ? `CH-${v}` : v
}

/* ------------------------------------------------------------------ */
/* Reservation form                                                    */
/* ------------------------------------------------------------------ */
function ReservationForm({ onCreated }) {
  const [today] = useState(() => manilaDate())
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [guests, setGuests] = useState('2')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [tick, setTick] = useState(0) // bump to reload the open times
  const [slotResult, setSlotResult] = useState(null) // { key, slots, error }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const guestsNum = Number(guests)
  const slotsKey =
    date && Number.isInteger(guestsNum) && guestsNum >= 1 ? `${date}|${guestsNum}|${tick}` : ''

  // Ask the database which times are still open for this date and party size.
  useEffect(() => {
    if (!slotsKey) return
    let cancelled = false
    supabase.rpc('get_open_slots', { p_date: date, p_guests: guestsNum }).then(({ data, error }) => {
      if (cancelled) return
      setSlotResult({
        key: slotsKey,
        slots: error ? [] : (data || []).filter((s) => s.is_open),
        error: error ? error.message : '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [slotsKey, date, guestsNum])

  const loaded = slotsKey && slotResult?.key === slotsKey ? slotResult : null
  const slotsLoading = Boolean(slotsKey) && !loaded
  const openSlots = loaded?.slots || []
  // If the chosen time is no longer open (date or guests changed), the dropdown goes back to blank.
  const chosenTime = openSlots.some((s) => s.slot_time === time) ? time : ''

  let placeholder = 'Choose a date and party size first'
  if (slotsKey) {
    if (slotsLoading) placeholder = 'Loading times…'
    else placeholder = openSlots.length ? 'Choose a time' : 'No open times'
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!chosenTime) {
      setError('Choose a time.')
      return
    }
    setSubmitting(true)
    setError('')
    const { data, error } = await supabase.rpc('submit_reservation', {
      p_name: name.trim(),
      p_contact: contact.trim(),
      p_guests: guestsNum,
      p_date: date,
      p_time: chosenTime,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      setTick((t) => t + 1) // the time may have just been taken
      return
    }
    onCreated(data.reservation_code)
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Reserve a table</h2>
      <p className="hint">
        Choose your party size, date, and time. Staff will review your request and give you a
        reservation ID once it is approved.
      </p>


      <label className="field">
        <span>Your name</span>
        <input
          type="text"
          required
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Contact number</span>
        <input
          type="tel"
          required
          maxLength={40}
          autoComplete="tel"
          inputMode="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Guests</span>
          <input
            type="number"
            required
            min={1}
            max={50}
            inputMode="numeric"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            required
            min={today}
            max={shiftDate(today, MAX_DAYS_AHEAD)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Time</span>
        <select
          required
          value={chosenTime}
          onChange={(e) => setTime(e.target.value)}
          disabled={!slotsKey || slotsLoading || openSlots.length === 0}
        >
          <option value="">{placeholder}</option>
          {openSlots.map((s) => (
            <option key={s.slot_time} value={s.slot_time}>
              {fmtTime(s.slot_time)}
            </option>
          ))}
        </select>
      </label>

      {loaded && !loaded.error && openSlots.length === 0 && (
        <p className="hint">
          No tables are open for this party size on this date. Try another date, or ask the
          restaurant about larger groups.
        </p>
      )}
      {loaded?.error && <p className="error">{loaded.error}</p>}
      {error && <p className="error">{error}</p>}

      <button className="btn full" type="submit" disabled={submitting || !chosenTime}>
        {submitting ? 'Sending…' : 'Send reservation request'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Look up a reservation by its ID                                     */
/* ------------------------------------------------------------------ */
function LookupForm({ onFound }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const code = normalizeCode(value)
    if (!code) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('get_reservation', { p_code: code })
    setBusy(false)
    if (error) setError(error.message)
    else if (!data) setError('No reservation found with that ID.')
    else onFound(code)
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Already have a reservation ID?</h2>
      <p className="hint">Enter it to check your status or cancel.</p>
      <div className="lookup">
        <input
          type="text"
          placeholder="CH-XXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Check status'}
        </button>
      </div>
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Reservation status (refreshes itself every few seconds)             */
/* ------------------------------------------------------------------ */
function StatusCard({ code, onReset }) {
  const [state, setState] = useState(null) // { code, data } - data is null when not found
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_reservation', { p_code: code })
    if (error) {
      setError(error.message)
    } else {
      setState({ code, data })
      setError('')
    }
  }, [code])

  useEffect(() => {
    const initialLoad = setTimeout(load, 0)
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  async function cancel() {
    if (!window.confirm('Cancel this reservation?')) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('cancel_reservation', { p_code: code })
    setBusy(false)
    if (error) setError(error.message)
    await load()
  }

  const res = state?.code === code ? state.data : undefined // undefined = still loading

  if (res === undefined) {
    return error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>
  }


  if (res === null) {
    return (
      <div className="empty-state">
        <p>We could not find this reservation.</p>
        <button className="btn" onClick={onReset}>
          Start over
        </button>
      </div>
    )
  }

  const info = STATUS[res.status] || { label: res.status, text: '' }
  // The ID is only shown once staff approve, so a pending request has no proof of booking yet.
  const showCode = res.status === 'approved' || res.status === 'arrived'
  const canCancel = res.status === 'pending' || res.status === 'approved'

  return (
    <div className="res-card">
      <div className="res-head">
        <strong>Your reservation</strong>
        <span className={`tag ${res.status}`}>{info.label}</span>
      </div>

      <div className={`res-code ${showCode ? '' : 'waiting'}`}>
        <small>Reservation ID</small>
        <strong>{showCode ? res.reservation_code : 'Shown here once staff approve'}</strong>
      </div>

      <dl className="res-details">
        <div>
          <dt>Name</dt>
          <dd>{res.customer_name}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>{res.guest_count}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{fmtDate(res.reservation_date)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{fmtTime(res.reservation_time)}</dd>
        </div>
      </dl>

      <p className="hint">{info.text}</p>
      {res.status === 'declined' && res.decline_reason && (
        <p className="decline-reason">
          <strong>Message from the restaurant:</strong> {res.decline_reason}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {canCancel ? (
        <button className="btn secondary full" disabled={busy} onClick={cancel}>
          {busy ? 'Cancelling…' : 'Cancel reservation'}
        </button>
      ) : (
        <button className="btn full" onClick={onReset}>
          Make a new reservation
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Reserve() {
  const [code, setCode] = useState(readStoredCode)

  function show(next) {
    storeCode(next)
    setCode(next)
  }

  return (
    <div className="app reserve">
      <header className="topbar">
        <span className="brand">Samgyup Chada</span>
        <span className="table-badge">Reservation</span>
      </header>

      <main className="content">
        {code ? (
          <StatusCard code={code} onReset={() => show('')} />
        ) : (
          <>
            <ReservationForm onCreated={show} />
            <hr className="divider" />
            <LookupForm onFound={show} />
          </>
        )}
      </main>
    </div>
  )
}

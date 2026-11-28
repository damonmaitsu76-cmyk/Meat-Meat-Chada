import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { confirmDialog } from '../../components/dialogs.js'
import { Field, StatusChip, Stepper } from '../../components/ui.jsx'
import { fmtDate, fmtTime, manilaDate, shiftDate } from '../../lib/dates.js'
import { friendlyError } from '../../lib/errors.js'
import { normalizePhone } from '../../lib/phone.js'
import { showTransition } from '../../lib/viewTransition.js'
import DayStrip from './DayStrip.jsx'
import Slip from './Slip.jsx'
import TimeBoard from './TimeBoard.jsx'
import diningRoom from '../../assets/chada-dining-room.webp'
import './Reserve.css'

const STORAGE_KEY = 'chada_reservation'
const POLL_MS = 5000
const MAX_DAYS_AHEAD = 60

const STATUS = {
  pending: { label: 'Pending', text: '' },
  approved: { label: 'Approved', text: 'Show this ID to the staff when you arrive.' },
  declined: { label: 'Declined', text: '' },
  cancelled: { label: 'Cancelled', text: '' },
  arrived: { label: 'Arrived', text: '' },
  auto_cancelled: { label: 'Released', text: 'You did not arrive in time, so the table was released.' },
}

// What this phone remembers about its reservation: the ID and the last 4 digits of the phone
// number. The database needs both to show the reservation or cancel it.
function readStored() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return saved && /^CH-[A-Z0-9]{6}$/.test(saved.code) && /^\d{4}$/.test(saved.last4) ? saved : null
  } catch { return null }
}

function store(reservation) {
  try {
    if (reservation) localStorage.setItem(STORAGE_KEY, JSON.stringify(reservation))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // The current page still works when private browsing blocks storage.
  }
}

function normalizeCode(raw) {
  const value = raw.trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9]{6}$/.test(value) ? `CH-${value}` : value
}

function ReservationForm({ onCreated }) {
  const [today] = useState(() => manilaDate())
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [guests, setGuests] = useState(2)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [tick, setTick] = useState(0)
  const [slotResult, setSlotResult] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const slotsKey = date && Number.isInteger(guests) && guests >= 1 ? `${date}|${guests}|${tick}` : ''

  useEffect(() => {
    if (!slotsKey) return
    let cancelled = false
    supabase.rpc('get_open_slots', { p_date: date, p_guests: guests }).then(({ data, error: slotError }) => {
      if (cancelled) return
      setSlotResult({ key: slotsKey, slots: data || [], error: friendlyError(slotError) })
    })
    return () => { cancelled = true }
  }, [slotsKey, date, guests])

  const loaded = slotsKey && slotResult?.key === slotsKey ? slotResult : null
  const slotsLoading = Boolean(slotsKey) && !loaded
  // While new times load, the board keeps showing the old ones (switched off) so the page does not jump.
  const slots = (loaded ?? slotResult)?.slots || []
  const openSlots = (loaded?.slots || []).filter((slot) => slot.is_open)
  const chosenTime = openSlots.some((slot) => slot.slot_time === time) ? time : ''
  const noOpenSlots = loaded && !loaded.error && openSlots.length === 0

  function updateField(field, setter, value) {
    setter(value)
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
  }

  async function onSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    const phone = normalizePhone(contact)
    if (!name.trim()) nextErrors.name = 'Enter your name.'
    if (!contact.trim()) nextErrors.contact = 'Enter a contact number.'
    else if (!phone) nextErrors.contact = 'Enter a valid Philippine mobile number, like 0917 123 4567.'
    if (!Number.isInteger(guests) || guests < 1 || guests > 50) nextErrors.guests = 'Choose between 1 and 50 guests.'
    if (!date || date < today || date > shiftDate(today, MAX_DAYS_AHEAD)) nextErrors.date = 'Choose a date within the next 60 days.'
    if (!chosenTime) nextErrors.time = 'Choose an open time.'
    setFieldErrors(nextErrors)
    setError('')
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const { data, error: submitError } = await supabase.rpc('submit_reservation', {
      p_name: name.trim(),
      p_contact: phone,
      p_guests: guests,
      p_date: date,
      p_time: chosenTime,
    })
    setSubmitting(false)
    if (submitError) {
      setError(friendlyError(submitError))
      setTick((value) => value + 1)
      return
    }
    onCreated({ code: data.reservation_code, last4: phone.slice(-4) })
  }

  return (
    <form className="reserve-form" onSubmit={onSubmit} noValidate>
      <figure className="reserve-photo">
        <img src={diningRoom} width="1568" height="673" alt="The Samgyup Chada dining room: black marble tables with tabletop grills and a neon-lit counter" />
      </figure>
      <h1>Reserve a table</h1>

      <section className="part" aria-labelledby="part-when">
        <h2 className="part-title" id="part-when"><span>When</span><span className="leader" aria-hidden="true" /></h2>

        <div className="guests" role="group" aria-labelledby="reservation-guests-label">
          <span id="reservation-guests-label" className="block-label">Guests</span>
          <Stepper value={guests} min={1} max={50} label="guests" onChange={(delta) => updateField('guests', setGuests, Math.min(50, Math.max(1, guests + delta)))} />
        </div>
        {fieldErrors.guests && <small className="field-error block-error" role="alert">{fieldErrors.guests}</small>}

        <div className="block">
          <span id="reservation-date-label" className="block-label">Date</span>
          <DayStrip
            today={today}
            max={shiftDate(today, MAX_DAYS_AHEAD)}
            value={date}
            labelledBy="reservation-date-label"
            onChange={(next) => { updateField('date', setDate, next); setTime('') }}
          />
          {fieldErrors.date && <small className="field-error block-error" role="alert">{fieldErrors.date}</small>}
        </div>

        <fieldset className="block" aria-invalid={fieldErrors.time ? 'true' : undefined} aria-describedby={fieldErrors.time ? 'reservation-time-error' : undefined}>
          <legend className="block-label">Time</legend>
          {loaded?.error && <div className="time-error"><p className="error">{loaded.error}</p><button type="button" className="btn secondary small" onClick={() => setTick((value) => value + 1)}>Try again</button></div>}
          {slots.length > 0 && <TimeBoard slots={slots} loading={slotsLoading} chosen={chosenTime} onChoose={(slotTime) => updateField('time', setTime, slotTime)} />}
          {slotsLoading && slots.length === 0 && <p className="field-hint">Loading times…</p>}
          {noOpenSlots && <p className="hint">No tables are open for this party size on this date. Try another date.</p>}
          {fieldErrors.time && <small className="field-error block-error" id="reservation-time-error" role="alert">{fieldErrors.time}</small>}
        </fieldset>
      </section>

      <section className="part" aria-labelledby="part-who">
        <h2 className="part-title" id="part-who"><span>Who</span><span className="leader" aria-hidden="true" /></h2>
        <Field
          id="reservation-name"
          label="Your name"
          type="text"
          required
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(event) => updateField('name', setName, event.target.value)}
          error={fieldErrors.name}
        />
        <Field
          id="reservation-contact"
          label="Contact number"
          type="tel"
          required
          maxLength={20}
          autoComplete="tel"
          inputMode="tel"
          placeholder="0917 123 4567"
          hint={fieldErrors.contact ? undefined : 'Philippine mobile number only.'}
          value={contact}
          onChange={(event) => updateField('contact', setContact, event.target.value.replace(/[^\d+\s().-]/g, ''))}
          error={fieldErrors.contact}
        />
      </section>

      <Slip date={date} time={chosenTime} guests={guests} />
      {error && <p className="error" role="alert">{error}</p>}
      <p className="hint">We use your name and number only to confirm your booking, and we remove your number from our records after 60 days.</p>
      <button className="btn full" type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reservation request'}
      </button>
    </form>
  )
}

function LookupForm({ onFound }) {
  const [value, setValue] = useState('')
  const [last4, setLast4] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const code = normalizeCode(value)
    if (!/^CH-[A-Z0-9]{6}$/.test(code)) {
      setError('Enter a 6-character reservation ID, such as CH-XXXXXX.')
      return
    }
    if (!/^\d{4}$/.test(last4)) {
      setError('Enter the last 4 digits of the phone number you booked with.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: lookupError } = await supabase.rpc('get_reservation', { p_code: code, p_phone_last4: last4 })
    setBusy(false)
    if (lookupError) setError(friendlyError(lookupError))
    else if (!data) setError('No reservation found. Check the ID and the last 4 digits of your phone number.')
    else onFound({ code, last4 })
  }

  return (
    <form className="lookup-stub" onSubmit={onSubmit} noValidate>
      <h2>Have a reservation ID?</h2>
      <div className="lookup">
        <label className="field lookup-field" htmlFor="lookup-code">
          <span>Reservation ID</span>
          <input
            id="lookup-code"
            className="ticket"
            type="text"
            placeholder="CH-XXXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            value={value}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'lookup-error' : undefined}
            onChange={(event) => { setValue(event.target.value); setError('') }}
          />
        </label>
        <label className="field lookup-field" htmlFor="lookup-phone">
          <span>Last 4 digits of your phone</span>
          <input
            id="lookup-phone"
            type="text"
            inputMode="numeric"
            placeholder="4567"
            autoComplete="off"
            maxLength={4}
            value={last4}
            onChange={(event) => { setLast4(event.target.value.replace(/\D/g, '')); setError('') }}
          />
        </label>
        <button className="btn secondary" type="submit" disabled={busy || !value.trim() || last4.length !== 4}>
          {busy ? 'Checking…' : 'Check status'}
        </button>
      </div>
      {error && <p className="error" id="lookup-error" role="alert">{error}</p>}
    </form>
  )
}

function StatusCard({ code, last4, onReset }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('get_reservation', { p_code: code, p_phone_last4: last4 })
    if (loadError) setError(friendlyError(loadError))
    else { setState({ code, data }); setError('') }
  }, [code, last4])

  useEffect(() => {
    const initialLoad = setTimeout(load, 0)
    const timer = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  async function cancel() {
    const ok = await confirmDialog({ title: 'Cancel this reservation?', confirmLabel: 'Cancel reservation', cancelLabel: 'Keep it' })
    if (!ok) return
    setBusy(true)
    setError('')
    const { error: cancelError } = await supabase.rpc('cancel_reservation', { p_code: code, p_phone_last4: last4 })
    setBusy(false)
    if (cancelError) setError(friendlyError(cancelError))
    await load()
  }

  const reservation = state?.code === code ? state.data : undefined
  if (reservation === undefined) return <div className="res-card">{error ? <><p className="error" role="alert">{error}</p><button className="btn secondary" type="button" onClick={load}>Try again</button></> : <p className="hint">Loading reservation…</p>}</div>
  if (reservation === null) return <div className="res-card"><div className="empty-state"><p>We could not find this reservation.</p><button className="btn" type="button" onClick={onReset}>Start over</button></div></div>

  const info = STATUS[reservation.status] || { label: reservation.status, text: '' }
  const showCode = reservation.status === 'approved' || reservation.status === 'arrived'
  const canCancel = reservation.status === 'pending' || reservation.status === 'approved'
  return (
    <div className="res-card">
      <div className="res-head">
        <strong>Your reservation</strong>
        <StatusChip status={reservation.status}>{info.label}</StatusChip>
      </div>
      <div className={`res-code ticket ${showCode ? 'confirmed' : 'waiting'}`}>
        <small>Reservation ID</small>
        <strong>{showCode ? reservation.reservation_code : 'Shown here once staff approve'}</strong>
      </div>
      <dl className="res-details">
        <div><dt>Name</dt><dd>{reservation.customer_name}</dd></div>
        <div><dt>Guests</dt><dd>{reservation.guest_count}</dd></div>
        <div><dt>Date</dt><dd>{fmtDate(reservation.reservation_date)}</dd></div>
        <div><dt>Time</dt><dd>{fmtTime(reservation.reservation_time)}</dd></div>
      </dl>
      {info.text && <p className="hint">{info.text}</p>}
      {reservation.status === 'declined' && reservation.decline_reason && <p className="decline-reason"><strong>Message from the restaurant:</strong> {reservation.decline_reason}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {canCancel ? (
        <button className="btn secondary full" type="button" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Cancel reservation'}</button>
      ) : <button className="btn full" type="button" onClick={onReset}>Make a new reservation</button>}
    </div>
  )
}

export default function Reserve() {
  const [saved, setSaved] = useState(readStored)
  // The form and the ticket swap places with a short cross-fade.
  function show(next) { store(next); showTransition(() => setSaved(next)) }

  return (
    <div className="app reserve">
      <header className="topbar"><span className="brand">Samgyup Chada</span></header>
      {/* The form sits on a paper sheet. The ticket does not: it sits straight on the red. */}
      <main className={`content ${saved ? 'content-bare' : ''}`.trim()}>
        {saved ? <><h1 className="sr-only">Reservation status</h1><StatusCard code={saved.code} last4={saved.last4} onReset={() => show(null)} /></> : <><ReservationForm onCreated={show} /><LookupForm onFound={show} /></>}
      </main>
    </div>
  )
}

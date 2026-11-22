import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { promptDialog } from '../../components/dialogs.js'
import { EmptyState, FilterTabs, Notice, PageToolbar, RecordCard, ResponsiveRecords, StatusChip } from '../../components/ui.jsx'
import { dayLabel, fmtTime, manilaDate, shiftDate, startMs } from '../../lib/dates.js'
import { displayName } from '../../lib/format.js'
import './Reservations.css'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'history', label: 'History' },
]
const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled', arrived: 'Arrived', auto_cancelled: 'No-show',
}
const OPEN_STATUSES = ['pending', 'approved']
const HISTORY_DAYS = 7
const NOTICE_HOURS = 2
const SAFETY_POLL_MS = 30000
let channelSeq = 0

function phoneHref(contact) {
  return `tel:${String(contact || '').replace(/[^+0-9*#,;]/g, '')}`
}

export default function Reservations() {
  const [rows, setRows] = useState(null)
  const [tables, setTables] = useState([])
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [info, setInfo] = useState('')
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    const since = shiftDate(manilaDate(), -HISTORY_DAYS)
    return supabase
      .from('reservations')
      .select('reservation_id, reservation_code, customer_name, contact_number, guest_count, reservation_date, reservation_time, status, updated_at, restaurant_tables(table_number)')
      .or(`status.in.(pending,approved),reservation_date.gte.${since}`)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        else { setRows(data); setError('') }
      })
  }, [])

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

  useEffect(() => {
    let cancelled = false
    supabase.from('restaurant_tables').select('table_id, table_number, capacity').eq('is_active', true).order('table_number')
      .then(({ data }) => { if (!cancelled && data) setTables(data) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  async function act(reservation, call, message) {
    setBusyId(reservation.reservation_id)
    const { data, error: actionFailure } = await call()
    setBusyId(null)
    setActionError(actionFailure ? actionFailure.message : '')
    setInfo(actionFailure ? '' : message(data))
    load()
  }

  function approve(reservation) {
    const picked = choice[reservation.reservation_id]
    act(reservation, () => supabase.rpc('approve_reservation', {
      p_reservation_id: reservation.reservation_id,
      p_table_id: picked ? Number(picked) : null,
    }), (data) => `Approved ${displayName(reservation.customer_name)} for Table ${data.table_number}.`)
  }

  async function decline(reservation) {
    const reason = await promptDialog({ title: 'Decline reservation', label: 'Reason shown to the customer (optional)', confirmLabel: 'Decline' })
    if (reason === null) return
    act(reservation, () => supabase.rpc('decline_reservation', { p_reservation_id: reservation.reservation_id, p_reason: reason }), () => `Declined ${displayName(reservation.customer_name)}'s reservation.`)
  }

  async function cancel(reservation) {
    const reason = await promptDialog({ title: 'Cancel reservation', label: 'Reason (optional)', confirmLabel: 'Cancel reservation', cancelLabel: 'Keep it' })
    if (reason === null) return
    act(reservation, () => supabase.rpc('staff_cancel_reservation', { p_reservation_id: reservation.reservation_id, p_reason: reason }), () => `Cancelled ${displayName(reservation.customer_name)}'s reservation.`)
  }

  function arrive(reservation) {
    act(reservation, () => supabase.rpc('confirm_arrival', { p_code: reservation.reservation_code, p_table_id: null }), (data) => `${displayName(reservation.customer_name)} seated at Table ${data.table_number}.`)
  }

  const all = rows || []
  const today = manilaDate(new Date(now))
  const query = search.trim().toLowerCase()
  const matchesFilter = (reservation, key) => key === 'history' ? !OPEN_STATUSES.includes(reservation.status) : reservation.status === key
  const count = (key) => all.filter((reservation) => matchesFilter(reservation, key)).length
  let visible = query
    ? all.filter((reservation) => [reservation.reservation_code, reservation.customer_name, reservation.contact_number].some((value) => String(value || '').toLowerCase().includes(query)))
    : all.filter((reservation) => matchesFilter(reservation, filter))
  if (!query && filter === 'history') visible = visible.slice().reverse()

  const noShows = all.filter((reservation) => reservation.status === 'auto_cancelled' && now - new Date(reservation.updated_at).getTime() < NOTICE_HOURS * 3600 * 1000)

  function actionsFor(reservation) {
    const busy = busyId === reservation.reservation_id
    const fits = tables.filter((table) => table.capacity >= reservation.guest_count)
    if (reservation.status === 'pending') {
      return (
        <div className="reservation-actions">
          <select aria-label={`Table for ${displayName(reservation.customer_name)}`} value={choice[reservation.reservation_id] ?? ''} disabled={busy} onChange={(event) => setChoice((current) => ({ ...current, [reservation.reservation_id]: event.target.value }))}>
            <option value="">Auto table</option>
            {fits.map((table) => <option key={table.table_id} value={table.table_id}>Table {table.table_number} · {table.capacity} seats</option>)}
          </select>
          <button className="btn small" type="button" disabled={busy} onClick={() => approve(reservation)}>Approve</button>
          <button className="btn small secondary" type="button" disabled={busy} onClick={() => decline(reservation)}>Decline</button>
        </div>
      )
    }
    if (reservation.status === 'approved') {
      return (
        <div className="reservation-actions">
          {reservation.reservation_date === today
            ? <button className="btn small" type="button" disabled={busy} onClick={() => arrive(reservation)}>Confirm arrival</button>
            : <span className="sub">Not for today</span>}
          <button className="btn small secondary" type="button" disabled={busy} onClick={() => cancel(reservation)}>Cancel</button>
        </div>
      )
    }
    return null
  }

  const records = visible.map((reservation) => {
    const passed = startMs(reservation.reservation_date, reservation.reservation_time) < now
    const late = reservation.status === 'pending' && passed
    const tableNo = reservation.restaurant_tables?.table_number
    const name = displayName(reservation.customer_name)
    const when = `${dayLabel(reservation.reservation_date, today)} ${fmtTime(reservation.reservation_time)}`
    const guest = <span>{name}{reservation.contact_number && <a className="sub contact-link" href={phoneHref(reservation.contact_number)}>{reservation.contact_number}</a>}</span>
    const status = <StatusChip status={reservation.status}>{STATUS_LABEL[reservation.status]}</StatusChip>
    const phoneMeta = <><span>{tableNo ? `Table ${tableNo}` : 'Auto table'} · </span><span className="ticket">{reservation.reservation_code}</span>{reservation.contact_number && <a className="contact-link" href={phoneHref(reservation.contact_number)}>{reservation.contact_number}</a>}</>
    const card = (
      <RecordCard
        className={late ? 'reservation-late' : ''}
        title={name}
        subtitle={`Party of ${reservation.guest_count} · ${when}${late ? ' · Time passed' : ''}`}
        meta={phoneMeta}
        status={status}
        actions={actionsFor(reservation)}
      >
        {reservation.status === 'declined' && reservation.decline_reason && <p className="decline-line">{reservation.decline_reason}</p>}
      </RecordCard>
    )
    const whenCell = <span>{dayLabel(reservation.reservation_date, today)}<span className="sub">{fmtTime(reservation.reservation_time)}{late ? ' · Time passed' : ''}</span></span>
    return {
      key: reservation.reservation_id,
      card,
      cells: [
        <span className="ticket">{reservation.reservation_code}</span>,
        guest,
        reservation.guest_count,
        whenCell,
        tableNo ? `Table ${tableNo}` : '—',
        status,
        actionsFor(reservation),
      ],
    }
  })

  return (
    <>
      <PageToolbar title="Reservations" live={live} />
      {noShows.length > 0 && <Notice tone="warn"><strong>Released after the grace period</strong><ul>{noShows.map((reservation) => <li key={reservation.reservation_id}>{displayName(reservation.customer_name)} (<span className="ticket">{reservation.reservation_code}</span>), booked for {fmtTime(reservation.reservation_time)}{reservation.restaurant_tables ? `, Table ${reservation.restaurant_tables.table_number} released` : ''}</li>)}</ul></Notice>}
      <input className="search" type="search" aria-label="Search reservations by ID, name, or phone" placeholder="Search by ID, name, or phone" value={search} onChange={(event) => setSearch(event.target.value)} />
      <FilterTabs label="Reservation filters" items={FILTERS.map((item) => ({ ...item, count: count(item.key) }))} value={query ? '' : filter} onChange={(key) => { setSearch(''); setFilter(key) }} />
      {info && <div className="success" role="status">{info}</div>}
      {(actionError || error) && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={load}>Try again</button>}>{actionError || error}</Notice>}
      {rows === null && !error && <p className="hint">Loading reservations…</p>}
      {rows && records.length === 0 && <EmptyState>{query ? 'No reservation matches your search. Check the ID, name, or phone and try again.' : filter === 'pending' ? 'No pending reservations. New requests appear here live.' : filter === 'approved' ? 'No approved reservations.' : 'No reservation history for the last 7 days.'}</EmptyState>}
      {records.length > 0 && <ResponsiveRecords className="reservation-records" headers={['ID', 'Guest', 'Party', 'When', 'Table', 'Status', 'Actions']} records={records} />}
    </>
  )
}

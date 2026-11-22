import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../supabaseClient.js'
import { Disclosure, Field, FilterTabs, Notice, PageToolbar } from '../../components/ui.jsx'
import { manilaDate, shiftDate } from '../../lib/dates.js'
import { formatDuration } from '../../lib/format.js'
import { downloadText } from '../../lib/download.js'
import './Reports.css'

const MAX_DAYS = 92
const LOG_LIMIT = 100

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function shortDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function weekdayDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

function rangeText(from, to) {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  const monthStart = start.toLocaleDateString('en-PH', { month: 'short' })
  const monthEnd = end.toLocaleDateString('en-PH', { month: 'short' })
  const yearStart = start.getFullYear()
  const yearEnd = end.getFullYear()
  const dayStart = start.getDate()
  const dayEnd = end.getDate()
  if (from === to) return `${monthStart} ${dayStart}, ${yearStart}`
  if (monthStart === monthEnd && yearStart === yearEnd) return `${monthStart} ${dayStart} – ${dayEnd}, ${yearEnd}`
  if (yearStart === yearEnd) return `${monthStart} ${dayStart} – ${monthEnd} ${dayEnd}, ${yearEnd}`
  return `${monthStart} ${dayStart}, ${yearStart} – ${monthEnd} ${dayEnd}, ${yearEnd}`
}

function presetsFor(today) {
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: '7', label: '7 days', from: shiftDate(today, -6), to: today },
    { key: '30', label: '30 days', from: shiftDate(today, -29), to: today },
    { key: 'month', label: 'This month', from: `${today.slice(0, 8)}01`, to: today },
  ]
}

function activityDay(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

function activityTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

function groupActivity(logs, today) {
  const groups = new Map()
  for (const log of logs) {
    const day = activityDay(log.created_at)
    const label = day === today ? 'Today' : day === shiftDate(today, -1) ? 'Yesterday' : shortDate(day)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(log)
  }
  return [...groups].map(([label, entries]) => ({ label, entries }))
}

function ticket(code) {
  return <span className="ticket">{code}</span>
}

function describe(log) {
  const details = log.details || {}
  switch (`${log.action}:${log.record_type}`) {
    case 'approve:reservation': return <>Approved {ticket(details.reservation_code)}{details.table_number ? ` for Table ${details.table_number}` : ''}</>
    case 'decline:reservation': return <>Declined {ticket(details.reservation_code)}{details.reason ? `: ${details.reason}` : ''}</>
    case 'staff_cancel:reservation': return <>Cancelled {ticket(details.reservation_code)} by staff{details.reason ? `: ${details.reason}` : ''}</>
    case 'arrive:reservation': return <>Seated {ticket(details.reservation_code)} at Table {details.table_number}</>
    case 'auto_cancel:reservation': return <>Released {ticket(details.reservation_code)} after the grace period (no-show)</>
    case 'import:menu_items':
    case 'import:restaurant_tables': return `Imported ${log.record_type === 'menu_items' ? 'menu items' : 'tables'}: ${details.imported} saved, ${details.skipped} skipped, ${details.failed} failed`
    case 'update:menu_items': return `Edited dish ${details.item_name}`
    case 'delete:menu_items': return `Deleted dish ${details.item_name}`
    case 'update:restaurant_tables': return details.is_active === false ? `Removed Table ${details.table_number}` : `Edited Table ${details.table_number}`
    case 'delete:restaurant_tables': return `Deleted Table ${details.table_number}`
    case 'create_account:users': return `Created the ${details.role} account ${details.username}`
    case 'reset_password:users': return `Reset the password of ${details.username}`
    case 'update_account:users': {
      const parts = []
      if (details.role !== details.previous_role) parts.push(`role changed from ${details.previous_role} to ${details.role}`)
      if (details.status !== details.previous_status) parts.push(details.status === 'inactive' ? 'deactivated' : 'reactivated')
      return `Account ${details.username}: ${parts.join(', ')}`
    }
    default: return `${log.action} (${log.record_type})`
  }
}

export default function Reports() {
  const [today] = useState(() => manilaDate())
  const presets = presetsFor(today)
  const [from, setFrom] = useState(presets[1].from)
  const [to, setTo] = useState(presets[1].to)
  const [result, setResult] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const valid = Boolean(from && to) && from <= to && daysBetween(from, to) < MAX_DAYS
  const key = valid ? `${from}|${to}` : ''

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const start = `${from}T00:00:00+08:00`
    const end = `${shiftDate(to, 1)}T00:00:00+08:00`
    Promise.all([
      supabase.rpc('get_report', { p_from: from, p_to: to }),
      supabase.from('activity_logs').select('log_id, action, record_type, details, created_at, users(username)').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).limit(LOG_LIMIT),
    ]).then(([reportResult, logResult]) => {
      if (cancelled) return
      const failure = reportResult.error || logResult.error
      setResult({ key, report: failure ? null : reportResult.data, logs: failure ? [] : logResult.data, error: failure ? failure.message : '' })
    })
    return () => { cancelled = true }
  }, [key, from, to, refresh])

  const loaded = key && result?.key === key ? result : null
  const loading = Boolean(key) && !loaded
  const report = loaded?.report
  const reservations = report?.reservations
  const sessions = report?.sessions
  const requests = report?.requests
  const daily = report?.daily || []
  const resolved = reservations ? reservations.arrived + reservations.no_show : 0
  const arrivalRate = resolved > 0 ? `${Math.round((reservations.arrived / resolved) * 100)}%` : '—'
  const serveTime = requests?.avg_serve_minutes == null ? '—' : formatDuration(requests.avg_serve_minutes)
  const chartData = daily.map((day) => ({ day: day.day, label: shortDate(day.day), guests: day.guests }))
  const busiest = daily.filter((day) => day.guests > 0).slice().sort((a, b) => b.guests - a.guests || b.day.localeCompare(a.day)).slice(0, 3)
  const busiestDay = busiest[0]
  const activityGroups = groupActivity(loaded?.logs || [], today)
  const selectedPreset = presets.find((preset) => preset.from === from && preset.to === to)
  const customRangeLabel = !selectedPreset && from && to ? rangeText(from, to) : 'Custom range'

  function exportCsv() {
    const sum = (keyName) => daily.reduce((total, day) => total + day[keyName], 0)
    const rows = daily.map((day) => ({ Date: day.day, 'Reservation requests': day.reservations, Arrived: day.arrived, 'No-shows': day.no_shows, 'Guests served': day.guests, 'Refill requests': day.requests }))
    rows.push({ Date: 'Total', 'Reservation requests': sum('reservations'), Arrived: sum('arrived'), 'No-shows': sum('no_shows'), 'Guests served': sum('guests'), 'Refill requests': sum('requests') })
    const summary = [['Booking-to-arrival rate', arrivalRate], ['Average time from sent to served (minutes)', requests.avg_serve_minutes ?? '']]
    downloadText(`chada-report_${from}_to_${to}.csv`, `${Papa.unparse(rows)}\r\n\r\n${Papa.unparse(summary)}`)
  }

  function applyPreset(preset) { setFrom(preset.from); setTo(preset.to) }
  function retry() { setResult(null); setRefresh((value) => value + 1) }

  let rangeProblem = ''
  if (from && to && from > to) rangeProblem = 'The start date must be on or before the end date.'
  else if (from && to && daysBetween(from, to) >= MAX_DAYS) rangeProblem = `Choose a range of at most ${MAX_DAYS} days.`
  else if (!from || !to) rangeProblem = 'Choose a start date and an end date.'

  return (
    <>
      <PageToolbar title="Reports" />
      <div className="rep-controls">
        <FilterTabs label="Report date range" value={selectedPreset?.key || ''} onChange={(selected) => applyPreset(presets.find((preset) => preset.key === selected))} items={presets} />
        <div className="rep-actions">
          <Disclosure label={customRangeLabel} className="rep-custom-range disclosure-button">
            <div className="rep-dates">
              <Field label="From" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
              <Field label="To" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </div>
          </Disclosure>
          <button className="btn secondary" type="button" disabled={!report} onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {rangeProblem && <p className="error">{rangeProblem}</p>}
      {loaded?.error && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={retry}>Try again</button>}>{loaded.error}</Notice>}
      {loading && <p className="hint">Loading report…</p>}

      {report && (
        <>
          <div className="rep-summary">
            <div className="rep-summary-tier primary">
              <article className="rep-figure"><strong className="rep-number">{sessions.guests}</strong><span>Guests served</span><small>{sessions.parties} {sessions.parties === 1 ? 'party' : 'parties'}</small></article>
              <article className="rep-figure"><strong className="rep-number">{reservations.total}</strong><span>Reservation requests</span></article>
              <article className="rep-figure"><strong className="rep-number">{reservations.no_show}</strong><span>No-shows</span></article>
            </div>
            <div className="rep-summary-tier secondary">
              <article className="rep-figure"><strong className="rep-number">{arrivalRate}</strong><span>Arrival rate</span><small>{reservations.arrived} of {resolved} arrived</small></article>
              <article className="rep-figure"><strong className="rep-number">{requests.total}</strong><span>Refill requests</span></article>
              <article className="rep-figure"><strong className="rep-number">{serveTime}</strong><span>Average time to serve</span></article>
            </div>
          </div>

          <section className="rep-card">
            <h2>Guests per day</h2>
            {sessions.guests === 0 ? <p className="empty-state">No guests were recorded in this period.</p> : <>
              <div className="rep-chart" role="img" aria-label={busiestDay ? `Guests served per day. Busiest day ${weekdayDate(busiestDay.day)} with ${busiestDay.guests} guests.` : 'Guests served per day. No guests were recorded.'}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12}}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={18} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-3)' }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: 'var(--text-3)' }} />
                    <Tooltip cursor={{ fill: 'var(--chart-hover)' }} labelFormatter={(_, items) => items?.[0] ? weekdayDate(items[0].payload.day) : ''} formatter={(value) => [value, 'Guests']} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--control)', borderRadius: 'var(--r-ctrl)', color: 'var(--text)' }} />
                    <Bar dataKey="guests" fill="var(--control)">{chartData.map((day) => <Cell key={day.day} fill={day.day === busiestDay?.day ? 'var(--brand)' : 'var(--control)'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {busiest.length > 0 && <p className="rep-note"><strong>Busiest {busiest.length === 1 ? 'day' : 'days'}:</strong> {busiest.map((day) => `${weekdayDate(day.day)} (${day.guests} guests)`).join(', ')}</p>}
              <p className="rep-note">{sessions.walk_in_guests} walk-in guests and {sessions.reservation_guests} guests who reserved.</p>
            </>}
          </section>

          <section className="rep-card">
            <h2>Reservations by status</h2>
            <ul className="rep-list">
              <li><span>Arrived</span><strong>{reservations.arrived}</strong></li>
              <li><span>No-shows (released after the grace period)</span><strong>{reservations.no_show}</strong></li>
              <li><span>Approved, not arrived yet</span><strong>{reservations.approved}</strong></li>
              <li><span>Waiting for approval</span><strong>{reservations.pending}</strong></li>
              <li><span>Declined</span><strong>{reservations.declined}</strong></li>
              <li><span>Cancelled (customer or staff)</span><strong>{reservations.cancelled}</strong></li>
            </ul>
            <p className="rep-note">Reservations are counted on the date they are booked for.</p>
          </section>

          <section className="rep-card">
            <h2>Activity</h2>
            {loaded.logs.length === 0 ? <p className="empty-state">No activity was recorded in this period.</p> : <>
              <div className="activity-groups">
                {activityGroups.map((group) => <section className="activity-day" key={group.label}>
                  <h3>{group.label}</h3>
                  <ul className="activity-list">
                    {group.entries.map((log) => <li key={log.log_id}>
                      <div className="activity-meta"><time>{activityTime(log.created_at)}</time><strong>{log.users?.username || 'System'}</strong></div>
                      <p>{describe(log)}</p>
                    </li>)}
                  </ul>
                </section>)}
              </div>
              {loaded.logs.length === LOG_LIMIT && <p className="rep-note">Showing the latest {LOG_LIMIT} entries. Choose fewer days to see older ones.</p>}
            </>}
          </section>
        </>
      )}
    </>
  )
}

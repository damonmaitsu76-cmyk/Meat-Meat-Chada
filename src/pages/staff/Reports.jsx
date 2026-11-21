import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../supabaseClient.js'
import { fmtDate, manilaDate, shiftDate } from '../../lib/dates.js'
import { downloadText } from '../../lib/download.js'
import './Reports.css'

const BRAND = '#b3261e'
const MAX_DAYS = 92 // longest range, so the chart stays readable
const LOG_LIMIT = 100 // newest activity entries shown

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function shortDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function weekdayDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function presetsFor(today) {
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: '7', label: 'Last 7 days', from: shiftDate(today, -6), to: today },
    { key: '30', label: 'Last 30 days', from: shiftDate(today, -29), to: today },
    { key: 'month', label: 'This month', from: `${today.slice(0, 8)}01`, to: today },
  ]
}

function whenText(iso) {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// One plain sentence for each kind of activity log entry.
function describe(log) {
  const d = log.details || {}
  switch (`${log.action}:${log.record_type}`) {
    case 'approve:reservation':
      return `Approved ${d.reservation_code}${d.table_number ? ` for Table ${d.table_number}` : ''}`
    case 'decline:reservation':
      return `Declined ${d.reservation_code}${d.reason ? `: ${d.reason}` : ''}`
    case 'staff_cancel:reservation':
      return `Cancelled ${d.reservation_code} by staff${d.reason ? `: ${d.reason}` : ''}`
    case 'arrive:reservation':
      return `Seated ${d.reservation_code} at Table ${d.table_number}`
    case 'auto_cancel:reservation':
      return `Released ${d.reservation_code} after the grace period (no-show)`
    case 'import:menu_items':
    case 'import:restaurant_tables':
      return `Imported ${log.record_type === 'menu_items' ? 'menu items' : 'tables'}: ${d.imported} saved, ${d.skipped} skipped, ${d.failed} failed`
    case 'update:menu_items':
      return `Edited dish ${d.item_name}`
    case 'delete:menu_items':
      return `Deleted dish ${d.item_name}`
    case 'update:restaurant_tables':
      return d.is_active === false ? `Removed Table ${d.table_number}` : `Edited Table ${d.table_number}`
    case 'delete:restaurant_tables':
      return `Deleted Table ${d.table_number}`
    case 'create_account:users':
      return `Created the ${d.role} account ${d.username}`
    case 'reset_password:users':
      return `Reset the password of ${d.username}`
    case 'update_account:users': {
      const parts = []
      if (d.role !== d.previous_role) parts.push(`role changed from ${d.previous_role} to ${d.role}`)
      if (d.status !== d.previous_status) parts.push(d.status === 'inactive' ? 'deactivated' : 'reactivated')
      return `Account ${d.username}: ${parts.join(', ')}`
    }
    default:
      return `${log.action} (${log.record_type})`
  }
}

export default function Reports() {
  const [today] = useState(() => manilaDate())
  const presets = presetsFor(today)
  const [from, setFrom] = useState(presets[1].from)
  const [to, setTo] = useState(presets[1].to)
  const [result, setResult] = useState(null) // { key, report, logs, error }

  const valid = Boolean(from && to) && from <= to && daysBetween(from, to) < MAX_DAYS
  const key = valid ? `${from}|${to}` : ''

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const start = `${from}T00:00:00+08:00`
    const end = `${shiftDate(to, 1)}T00:00:00+08:00`
    Promise.all([
      supabase.rpc('get_report', { p_from: from, p_to: to }),
      supabase
        .from('activity_logs')
        .select('log_id, action, record_type, details, created_at, users(username)')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(LOG_LIMIT),
    ]).then(([rep, logs]) => {
      if (cancelled) return
      const failed = rep.error || logs.error
      setResult({
        key,
        report: failed ? null : rep.data,
        logs: failed ? [] : logs.data,
        error: failed ? failed.message : '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [key, from, to])

  const loaded = key && result?.key === key ? result : null
  const loading = Boolean(key) && !loaded
  const report = loaded?.report

  const res = report?.reservations
  const sess = report?.sessions
  const reqs = report?.requests
  const daily = report?.daily || []

  const resolved = res ? res.arrived + res.no_show : 0
  const arrivalRate = resolved > 0 ? `${Math.round((res.arrived / resolved) * 100)}%` : '—'
  const serveTime = reqs?.avg_serve_minutes == null ? '—' : `${reqs.avg_serve_minutes} min`

  const chartData = daily.map((d) => ({ day: d.day, label: shortDate(d.day), guests: d.guests }))
  const busiest = daily
    .filter((d) => d.guests > 0)
    .slice()
    .sort((a, b) => b.guests - a.guests || b.day.localeCompare(a.day))
    .slice(0, 3)

  function exportCsv() {
    const sum = (k) => daily.reduce((total, d) => total + d[k], 0)
    const rows = daily.map((d) => ({
      Date: d.day,
      'Reservation requests': d.reservations,
      Arrived: d.arrived,
      'No-shows': d.no_shows,
      'Guests served': d.guests,
      'Refill requests': d.requests,
    }))
    rows.push({
      Date: 'Total',
      'Reservation requests': sum('reservations'),
      Arrived: sum('arrived'),
      'No-shows': sum('no_shows'),
      'Guests served': sum('guests'),
      'Refill requests': sum('requests'),
    })
    const summary = [
      ['Booking-to-arrival rate', arrivalRate],
      ['Average time from sent to served (minutes)', reqs.avg_serve_minutes ?? ''],
    ]
    downloadText(
      `chada-report_${from}_to_${to}.csv`,
      `${Papa.unparse(rows)}\r\n\r\n${Papa.unparse(summary)}`
    )
  }

  function applyPreset(p) {
    setFrom(p.from)
    setTo(p.to)
  }

  let rangeProblem = ''
  if (from && to && from > to) rangeProblem = 'The start date must be on or before the end date.'
  else if (from && to && daysBetween(from, to) >= MAX_DAYS) {
    rangeProblem = `Choose a range of at most ${MAX_DAYS} days.`
  } else if (!from || !to) rangeProblem = 'Choose a start date and an end date.'

  return (
    <>
      <div className="page-head">
        <h1>Reports and insights</h1>
        <button
          className="btn secondary small"
          type="button"
          disabled={!report}
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>

      <div className="rep-filters">
        <div className="filters">
          {presets.map((p) => (
            <button
              key={p.key}
              className={`chip ${from === p.from && to === p.to ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="rep-dates">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      {rangeProblem && <p className="error">{rangeProblem}</p>}
      {loaded?.error && <p className="error">{loaded.error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {report && (
        <>
          <p className="hint">
            {from === to ? fmtDate(from) : `${fmtDate(from)} to ${fmtDate(to)}`}
          </p>

          <div className="stats">
            <div className="stat">
              <span className="stat-num">{res.total}</span>
              <span className="stat-label">Reservation requests</span>
            </div>
            <div className="stat">
              <span className="stat-num">{sess.guests}</span>
              <span className="stat-label">Guests served</span>
              <span className="stat-sub">
                {sess.parties} {sess.parties === 1 ? 'party' : 'parties'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-num">{res.no_show}</span>
              <span className="stat-label">No-shows</span>
            </div>
            <div className="stat">
              <span className="stat-num">{arrivalRate}</span>
              <span className="stat-label">Booking-to-arrival rate</span>
              <span className="stat-sub">arrived ÷ (arrived + no-shows)</span>
            </div>
            <div className="stat">
              <span className="stat-num">{reqs.total}</span>
              <span className="stat-label">Refill requests</span>
            </div>
            <div className="stat">
              <span className="stat-num">{serveTime}</span>
              <span className="stat-label">Average time to serve</span>
              <span className="stat-sub">from sent to served</span>
            </div>
          </div>

          <section className="rep-card">
            <h2>Guests per day</h2>
            {sess.guests === 0 ? (
              <p className="empty-state">No guests were recorded in this period.</p>
            ) : (
              <>
                <div className="rep-chart" role="img" aria-label="Bar chart of guests served each day">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid vertical={false} stroke="#e7dfdb" />
                      <XAxis
                        dataKey="label"
                        interval="preserveStartEnd"
                        minTickGap={18}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#6f6663' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        tick={{ fontSize: 12, fill: '#6f6663' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#faf7f5' }}
                        labelFormatter={(_, items) => (items?.[0] ? weekdayDate(items[0].payload.day) : '')}
                        formatter={(value) => [value, 'Guests']}
                      />
                      <Bar dataKey="guests" fill={BRAND} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="rep-note">
                  <strong>Busiest {busiest.length === 1 ? 'day' : 'days'}:</strong>{' '}
                  {busiest.map((d) => `${weekdayDate(d.day)} (${d.guests} guests)`).join(', ')}
                </p>
                <p className="rep-note">
                  {sess.walk_in_guests} walk-in guests and {sess.reservation_guests} guests who
                  reserved.
                </p>
              </>
            )}
          </section>

          <section className="rep-card">
            <h2>Reservations by status</h2>
            <ul className="rep-list">
              <li><span>Arrived</span><strong>{res.arrived}</strong></li>
              <li><span>No-show (released after the grace period)</span><strong>{res.no_show}</strong></li>
              <li><span>Approved, not arrived yet</span><strong>{res.approved}</strong></li>
              <li><span>Waiting for approval</span><strong>{res.pending}</strong></li>
              <li><span>Declined</span><strong>{res.declined}</strong></li>
              <li><span>Cancelled (customer or staff)</span><strong>{res.cancelled}</strong></li>
            </ul>
            <p className="rep-note">Reservations are counted on the date they are booked for.</p>
          </section>

          <section className="rep-card">
            <h2>Activity</h2>
            {loaded.logs.length === 0 ? (
              <p className="empty-state">No activity was recorded in this period.</p>
            ) : (
              <>
                <table className="q-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>What</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.logs.map((l) => (
                      <tr key={l.log_id}>
                        <td data-label="When">{whenText(l.created_at)}</td>
                        <td data-label="Who">{l.users?.username || 'System'}</td>
                        <td data-label="What">{describe(l)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loaded.logs.length === LOG_LIMIT && (
                  <p className="rep-note">
                    Showing the latest {LOG_LIMIT} entries. Choose fewer days to see older ones.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

const ACTIVE = ['sent', 'accepted', 'ready']
const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'sent', label: 'New' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ready', label: 'Ready' },
  { key: 'served', label: 'Served' },
]
const STATUS_LABEL = { sent: 'New', accepted: 'Accepted', ready: 'Ready', served: 'Served' }
// The button that moves a request to its next status.
const NEXT = {
  sent: { status: 'accepted', label: 'Accept' },
  accepted: { status: 'ready', label: 'Ready' },
  ready: { status: 'served', label: 'Served' },
}
const LATE_MINUTES = 5 // a NEW request waiting this long is highlighted
const SAFETY_POLL_MS = 30000 // in case the live connection silently drops
const SERVED_HOURS = 12 // how far back the "Served" filter looks

let channelSeq = 0

function waitedText(createdAt, now) {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function RequestQueue() {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('') // problems loading the list
  const [actionError, setActionError] = useState('') // problems with a button press; a reload must not clear it
  const [filter, setFilter] = useState('active')
  const [busyId, setBusyId] = useState(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    const since = new Date(Date.now() - SERVED_HOURS * 3600 * 1000).toISOString()
    return supabase
      .from('refill_requests')
      .select(
        'request_id, request_number, status, note, created_at, ' +
          'restaurant_tables(table_number), request_items(item_name, quantity)'
      )
      .or(`status.neq.served,created_at.gte.${since}`)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          setRequests(data)
          setError('')
        }
      })
  }, [])

  // Load, then stay up to date: Supabase Realtime pushes a change, we reload the list.
  useEffect(() => {
    load()
    const channel = supabase
      .channel(`refill-requests-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refill_requests' }, load)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, SAFETY_POLL_MS)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [load])

  // Re-draw the "waiting" times every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  async function advance(request) {
    const next = NEXT[request.status]
    if (!next) return
    setBusyId(request.request_id)
    const { error } = await supabase.rpc('advance_refill_request', {
      p_request_id: request.request_id,
      p_status: next.status,
    })
    setBusyId(null)
    setActionError(error ? error.message : '')
    load() // also refreshes the list if someone else already moved it
  }

  const all = requests || []
  const matches = (r, key) => (key === 'active' ? ACTIVE.includes(r.status) : r.status === key)
  const count = (key) => all.filter((r) => matches(r, key)).length
  const visible = all.filter((r) => matches(r, filter))
  if (filter === 'served') visible.reverse() // newest served first

  return (
    <>
      <div className="page-head">
        <h1>Request Queue</h1>
        <span className={`live ${live ? 'on' : ''}`}>{live ? '● Live' : '○ Reconnecting…'}</span>
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({count(f.key)})
          </button>
        ))}
      </div>

      {(actionError || error) && <p className="error">{actionError || error}</p>}
      {requests === null && !error && <p className="hint">Loading…</p>}
      {requests && visible.length === 0 && (
        <p className="empty-state">
          {filter === 'active' ? 'No active requests. 🎉' : 'Nothing here.'}
        </p>
      )}

      {visible.length > 0 && (
        <table className="q-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Table</th>
              <th>Items</th>
              <th>Notes</th>
              <th>Status</th>
              <th>Waiting</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const next = NEXT[r.status]
              const mins = (now - new Date(r.created_at).getTime()) / 60000
              const late = r.status === 'sent' && mins >= LATE_MINUTES
              return (
                <tr key={r.request_id} className={late ? 'late' : ''}>
                  <td data-label="Request">
                    <strong>{r.request_number}</strong>
                  </td>
                  <td data-label="Table">Table {r.restaurant_tables?.table_number}</td>
                  <td data-label="Items">
                    <ul className="items">
                      {r.request_items.map((i) => (
                        <li key={i.item_name}>
                          {i.quantity} × {i.item_name}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="Notes">{r.note || '—'}</td>
                  <td data-label="Status">
                    <span className={`tag ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td data-label="Waiting">{waitedText(r.created_at, now)}</td>
                  <td data-label="Action">
                    {next && (
                      <button
                        className="btn small"
                        disabled={busyId === r.request_id}
                        onClick={() => advance(r)}
                      >
                        {next.label}
                      </button>
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

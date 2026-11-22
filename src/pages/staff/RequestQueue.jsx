import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { EmptyState, FilterTabs, Notice, PageToolbar, RecordCard, StatusChip } from '../../components/ui.jsx'
import { formatDuration } from '../../lib/format.js'
import './RequestQueue.css'

const ACTIVE = ['sent', 'accepted', 'ready']
const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'sent', label: 'New' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ready', label: 'Ready' },
  { key: 'served', label: 'Served' },
]
const STATUS_LABEL = { sent: 'New', accepted: 'Accepted', ready: 'Ready', served: 'Served' }
const NEXT = {
  sent: { status: 'accepted', label: 'Accept' },
  accepted: { status: 'ready', label: 'Mark ready' },
  ready: { status: 'served', label: 'Mark served' },
}
const LATE_MINUTES = 5
const SAFETY_POLL_MS = 30000
const SERVED_HOURS = 12
let channelSeq = 0

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function servedText(request) {
  if (!request.served_at) return 'Served'
  const minutes = (new Date(request.served_at).getTime() - new Date(request.created_at).getTime()) / 60000
  return `Served in ${formatDuration(minutes)}`
}

export default function RequestQueue() {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [filter, setFilter] = useState('active')
  const [busyId, setBusyId] = useState(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    const since = new Date(Date.now() - SERVED_HOURS * 3600 * 1000).toISOString()
    return supabase
      .from('refill_requests')
      .select(
        'request_id, request_number, status, note, created_at, served_at, ' +
          'restaurant_tables(table_number), request_items(item_name, quantity)'
      )
      .or(`status.neq.served,created_at.gte.${since}`)
      .order('created_at', { ascending: true })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        else { setRequests(data); setError('') }
      })
  }, [])

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  async function advance(request) {
    const next = NEXT[request.status]
    if (!next) return
    setBusyId(request.request_id)
    const { error: advanceError } = await supabase.rpc('advance_refill_request', {
      p_request_id: request.request_id,
      p_status: next.status,
    })
    setBusyId(null)
    setActionError(advanceError ? advanceError.message : '')
    load()
  }

  const all = requests || []
  const matches = (request, key) => key === 'active' ? ACTIVE.includes(request.status) : request.status === key
  const count = (key) => all.filter((request) => matches(request, key)).length
  const visible = all.filter((request) => matches(request, filter))
  if (filter === 'served') visible.reverse()

  return (
    <>
      <PageToolbar title="Request queue" live={live} />
      <FilterTabs
        label="Request filters"
        value={filter}
        onChange={setFilter}
        items={FILTERS.map((item) => ({ ...item, count: count(item.key) }))}
      />

      {(actionError || error) && <Notice tone="warn" action={<button className="btn secondary small" type="button" onClick={load}>Try again</button>}>{actionError || error}</Notice>}
      {requests === null && !error && <p className="hint">Loading requests…</p>}
      {requests && visible.length === 0 && (
        <EmptyState>
          {filter === 'active' ? 'No open requests. New ones appear here live.' : filter === 'served' ? 'No served requests in the last 12 hours.' : `No ${FILTERS.find((item) => item.key === filter)?.label.toLowerCase()} requests.`}
        </EmptyState>
      )}

      {visible.length > 0 && (
        <div className="request-grid">
          {visible.map((request) => {
            const next = NEXT[request.status]
            const waited = Math.max(0, Math.floor((now - new Date(request.created_at).getTime()) / 60000))
            const late = request.status === 'sent' && waited >= LATE_MINUTES
            const items = request.request_items || []
            return (
              <RecordCard
                key={request.request_id}
                className={`request-ticket ${late ? 'late' : ''}`}
                title={`Table ${request.restaurant_tables?.table_number ?? '—'}`}
                status={<StatusChip status={request.status}>{STATUS_LABEL[request.status]}</StatusChip>}
                subtitle={<><span className="ticket">{request.request_number}</span><span> · {formatTime(request.created_at)}</span></>}
                actions={next ? (
                  <button className="btn full" type="button" disabled={busyId === request.request_id} onClick={() => advance(request)}>
                    {busyId === request.request_id ? 'Saving…' : next.label}
                  </button>
                ) : undefined}
              >
                {late && <p className="request-waiting">Waiting {formatDuration(waited)}</p>}
                <ul className="ticket-items">
                  {items.map((item) => <li key={item.item_name}><span>{item.quantity}</span> × {item.item_name}</li>)}
                </ul>
                {request.note && <p className="ticket-note">{request.note}</p>}
                {request.status === 'served' && <p className="served-time">{servedText(request)}</p>}
              </RecordCard>
            )
          })}
        </div>
      )}
    </>
  )
}

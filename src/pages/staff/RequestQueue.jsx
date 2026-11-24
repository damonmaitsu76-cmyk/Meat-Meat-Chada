import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { confirmDialog } from '../../components/dialogs.js'
import { EmptyState, Notice, PageToolbar, RecordCard } from '../../components/ui.jsx'
import { plural } from '../../lib/floor.js'
import { formatDuration } from '../../lib/format.js'
import './RequestQueue.css'

const NEXT = {
  sent: { status: 'accepted', label: 'Accept', bulk: 'Accept all' },
  accepted: { status: 'ready', label: 'Mark ready', bulk: 'Mark all ready' },
  ready: { status: 'served', label: 'Mark served', bulk: 'Mark all served' },
}
const GROUPS = [
  { status: 'sent', label: 'New' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'ready', label: 'Ready' },
]
const LATE_MINUTES = 5
const SAFETY_POLL_MS = 30000
const SERVED_HOURS = 12
const SERVED_SHOWN = 10 // served rows listed before "Show all"
const TICKET_ITEM_LIMIT = 6 // lines shown on a ticket before "Show more"
let channelSeq = 0

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

// How long a request took from sent to served: "under 1 min", "2 min" or "1 h 34 min".
function servedIn(request) {
  if (!request.served_at) return '—'
  const minutes = (new Date(request.served_at).getTime() - new Date(request.created_at).getTime()) / 60000
  return minutes < 1 ? 'under 1 min' : formatDuration(minutes)
}

function totalQuantity(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

// An order can hold a large part of the menu, so lists stay dense and long ones fold.
function ItemList({ items, limit = Infinity }) {
  const [expanded, setExpanded] = useState(false)
  const folded = !expanded && items.length > limit
  const shown = folded ? items.slice(0, limit) : items
  const hidden = items.length - shown.length
  return (
    <>
      <ul className="ticket-items">
        {shown.map((item) => <li key={item.item_name}><strong>{item.quantity}×</strong><span>{item.item_name}</span></li>)}
      </ul>
      {items.length > limit && (
        <button className="btn ghost small ticket-items-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer items' : `Show ${hidden} more ${hidden === 1 ? 'item' : 'items'}`}
        </button>
      )}
    </>
  )
}

// One served request as a single line: when, which table, what, and how long it took.
function ServedRow({ request, items }) {
  const table = request.restaurant_tables?.table_number ?? '—'
  const preview = items.map((item) => `${item.quantity}× ${item.item_name}`).join(', ')
  return (
    <li>
      <details className="served-row">
        <summary>
          <time className="served-when" dateTime={request.created_at}>{formatTime(request.created_at)}</time>
          <span className="served-table">Table {table}</span>
          <span className="served-preview">{preview || 'No items'}</span>
          <span className="served-took">{servedIn(request)}</span>
        </summary>
        <div className="served-detail">
          <p className="served-meta">
            <span className="ticket">{request.request_number}</span>
            <span> · Sent {formatTime(request.created_at)}</span>
            {request.served_at && <span> · Served {formatTime(request.served_at)}</span>}
          </p>
          <ItemList items={items} />
          {request.note && <p className="ticket-note"><strong>Note:</strong> {request.note}</p>}
        </div>
      </details>
    </li>
  )
}

export default function RequestQueue() {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [busyGroup, setBusyGroup] = useState(null)
  const [showAllServed, setShowAllServed] = useState(false)
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

  // Moves every request in one group forward together, for a table that sent several in a row.
  async function advanceAll(group) {
    const next = NEXT[group.status]
    if (next.status === 'served') {
      const ok = await confirmDialog({
        title: `Mark ${group.requests.length} requests served?`,
        message: 'Guests see them as served right away.',
        confirmLabel: 'Mark all served',
        cancelLabel: 'Not yet',
      })
      if (!ok) return
    }
    setBusyGroup(group.status)
    const results = await Promise.all(
      group.requests.map((request) =>
        supabase.rpc('advance_refill_request', { p_request_id: request.request_id, p_status: next.status })
      )
    )
    setBusyGroup(null)
    const failed = results.find((result) => result.error)
    setActionError(failed ? failed.error.message : '')
    load()
  }

  const all = requests || []
  const activeGroups = GROUPS.map((group) => ({ ...group, requests: all.filter((request) => request.status === group.status) })).filter((group) => group.requests.length > 0)
  const served = all.filter((request) => request.status === 'served').reverse()
  const shownServed = showAllServed ? served : served.slice(0, SERVED_SHOWN)

  return (
    <>
      <PageToolbar title="Request queue" live={live} />

      {(actionError || error) && <Notice tone="warn" action={<button className="btn secondary small" type="button" onClick={load}>Try again</button>}>{actionError || error}</Notice>}
      {requests === null && !error && <p className="hint">Loading requests…</p>}
      {requests && !error && activeGroups.length === 0 && <EmptyState>No open requests. New ones show up here as soon as a table sends one.</EmptyState>}

      {activeGroups.map((group) => (
        <section className="queue-group" key={group.status} aria-labelledby={`queue-${group.status}`}>
          <div className="queue-group-head">
            <h2 className="queue-group-heading" id={`queue-${group.status}`}>{group.label} <span>{group.requests.length}</span></h2>
            {group.requests.length > 1 && (
              <button className="btn ghost small" type="button" disabled={busyGroup === group.status} onClick={() => advanceAll(group)}>
                {busyGroup === group.status ? 'Saving…' : NEXT[group.status].bulk}
              </button>
            )}
          </div>
          <div className="request-grid">
            {group.requests.map((request) => {
              const next = NEXT[request.status]
              const waited = Math.max(0, Math.floor((now - new Date(request.created_at).getTime()) / 60000))
              const late = request.status === 'sent' && waited >= LATE_MINUTES
              const items = request.request_items || []
              const busy = busyId === request.request_id || busyGroup === group.status
              return (
                <RecordCard
                  key={request.request_id}
                  className={`request-ticket ${late ? 'late' : ''}`.trim()}
                  title={`Table ${request.restaurant_tables?.table_number ?? '—'}`}
                  status={<span className="ticket request-age">{late ? 'Waiting ' : ''}{formatDuration(waited)}</span>}
                  subtitle={<><span className="ticket">{request.request_number}</span><span> · {formatTime(request.created_at)}</span><span> · {plural(totalQuantity(items), 'item', 'items')}</span></>}
                  actions={next ? (
                    <button className="btn full" type="button" disabled={busy} onClick={() => advance(request)}>
                      {busyId === request.request_id ? 'Saving…' : next.label}
                    </button>
                  ) : undefined}
                >
                  <ItemList items={items} limit={TICKET_ITEM_LIMIT} />
                  {request.note && <p className="ticket-note"><strong>Note:</strong> {request.note}</p>}
                </RecordCard>
              )
            })}
          </div>
        </section>
      ))}

      {served.length > 0 && (
        <section className="served-group" aria-labelledby="queue-served">
          <h2 className="queue-group-heading" id="queue-served">Served in the last {SERVED_HOURS} hours <span>{served.length}</span></h2>
          <div className="served-head" aria-hidden="true"><span>Sent</span><span>Table</span><span>Order</span><span>Served in</span></div>
          <ul className="served-list">{shownServed.map((request) => <ServedRow key={request.request_id} request={request} items={request.request_items || []} />)}</ul>
          {served.length > SERVED_SHOWN && (
            <button className="btn ghost small served-toggle" type="button" aria-expanded={showAllServed} onClick={() => setShowAllServed((value) => !value)}>
              {showAllServed ? 'Show fewer' : `Show all ${served.length}`}
            </button>
          )}
        </section>
      )}
    </>
  )
}

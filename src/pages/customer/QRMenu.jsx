import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, Notice, StatusChip, Stepper } from '../../components/ui.jsx'
import { supabase } from '../../supabaseClient.js'

const CATEGORIES = [
  { key: 'meats', label: 'Meats' },
  { key: 'sides', label: 'Sides' },
  { key: 'drinks', label: 'Drinks' },
]
const STATUS_ORDER = ['sent', 'accepted', 'ready', 'served']
const STATUS_LABELS = { sent: 'Sent', accepted: 'Accepted', ready: 'Ready', served: 'Served' }
const MAX_QTY = 20
const POLL_MS = 4000
const MENU_POLL_MS = 10000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function MenuView({ items, tray, onAdd, onChangeQty }) {
  const [category, setCategory] = useState('meats')
  const visible = items.filter((item) => item.category === category)

  return (
    <>
      <p className="menu-intro">Add refills, then send them to staff.</p>
      <div className="tabs menu-tabs" role="tablist" aria-label="Menu categories">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={category === item.key}
            className={`tab ${category === item.key ? 'active' : ''}`}
            onClick={() => setCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ul className="menu-list" role="tabpanel" aria-label={CATEGORIES.find((item) => item.key === category)?.label}>
        {visible.length === 0 && <li className="menu-empty">No dishes in this category.</li>}
        {visible.map((item) => {
          const quantity = tray[item.item_id] || 0
          return (
            <li key={item.item_id} className={`menu-row ${item.is_available ? '' : 'unavailable'}`}>
              <span className="menu-name">{item.item_name}</span>
              {item.is_available ? (
                quantity > 0 ? (
                  <Stepper
                    value={quantity}
                    label={item.item_name}
                    max={MAX_QTY}
                    onChange={(delta) => onChangeQty(item.item_id, delta)}
                  />
                ) : (
                  <button type="button" className="btn secondary small" onClick={() => onAdd(item.item_id)}>
                    Add
                  </button>
                )
              ) : (
                <span className="out-for-now">Out for now</span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TrayView({ itemsById, tray, note, setNote, onChangeQty, onSend, sending, error, onBrowse }) {
  const lines = Object.entries(tray)
    .map(([id, quantity]) => ({ id: Number(id), quantity, item: itemsById[id] }))
    .filter((line) => line.item)
  const hasUnavailable = lines.some((line) => !line.item.is_available)
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)

  if (lines.length === 0) {
    return <EmptyState action={<button className="btn" type="button" onClick={onBrowse}>Browse the menu</button>}>Your tray is empty. Add dishes from the menu to start a request.</EmptyState>
  }

  return (
    <>
      <h1 className="customer-title">Your tray · {itemCount} {itemCount === 1 ? 'item' : 'items'}</h1>
      <ul className="list tray-list">
        {lines.map(({ id, quantity, item }) => (
          <li key={id} className={`row tray-row ${item.is_available ? '' : 'unavailable'}`}>
            <div className="row-main">
              <span className="row-name">{item.item_name}</span>
              {!item.is_available && <span className="out-for-now">No longer available</span>}
            </div>
            <Stepper
              value={quantity}
              label={item.item_name}
              max={MAX_QTY}
              onChange={(delta) => onChangeQty(id, delta)}
            />
          </li>
        ))}
      </ul>

      <label className="field">
        <span>Note for staff (optional)</span>
        <textarea
          rows={3}
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. no spice, extra lettuce"
        />
      </label>

      {hasUnavailable && <p className="error">Remove dishes that are no longer available before sending.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tray-submit">
        <button className="btn full" type="button" disabled={sending || hasUnavailable} onClick={onSend}>
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </>
  )
}

function StatusView({ qrToken, justSent }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    const safeLoad = async () => {
      if (document.hidden) return
      const { data, error: requestError } = await supabase.rpc('get_table_requests', { p_qr_token: qrToken })
      if (cancelled) return
      if (requestError) setError(requestError.message)
      else {
        setRequests(data)
        setError('')
      }
    }
    safeLoad()
    const timer = setInterval(safeLoad, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrToken, refresh])

  return (
    <>
      {justSent && <div className="success" role="status">Request sent. Your request number is <strong className="ticket">{justSent}</strong>.</div>}
      <h1 className="customer-title">Request status</h1>
      {error && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={() => { setRequests(null); setRefresh((value) => value + 1) }}>Try again</button>}>{error}</Notice>}
      {requests === null && !error && <p className="hint">Loading requests…</p>}
      {requests && requests.length === 0 && <EmptyState>No requests from this table yet. Send a refill request from the menu to see it here.</EmptyState>}

      <ul className="list request-list">
        {(requests || []).map((request) => {
          const activeIndex = STATUS_ORDER.indexOf(request.status)
          return (
            <li key={request.request_number} className="request ticket-card">
              <div className="request-head">
                <strong className="ticket">{request.request_number}</strong>
                <StatusChip status={request.status}>{STATUS_LABELS[request.status] || request.status}</StatusChip>
              </div>
              <ol className="request-progress" aria-label={`Request progress: ${STATUS_LABELS[request.status] || request.status}`}>
                {STATUS_ORDER.map((status, index) => (
                  <li key={status} className={index === activeIndex ? 'current' : index < activeIndex ? 'done' : ''} aria-current={index === activeIndex ? 'step' : undefined}>
                    {STATUS_LABELS[status]}
                  </li>
                ))}
              </ol>
              <ul className="request-items">
                {request.items.map((item) => <li key={item.item_name}><span>{item.quantity}</span> × {item.item_name}</li>)}
              </ul>
              {request.note && <p className="request-note">Note for staff: {request.note}</p>}
              <p className="request-time">Sent at {formatTime(request.created_at)}</p>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export default function QRMenu() {
  const { qrToken } = useParams()
  const validToken = UUID_RE.test(qrToken || '')
  const [menu, setMenu] = useState(null)
  const [fetchError, setFetchError] = useState('')
  const [view, setView] = useState('menu')
  const [tray, setTray] = useState({})
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [justSent, setJustSent] = useState('')

  const loadMenu = useCallback(() => {
    if (!validToken) return Promise.resolve()
    return supabase.rpc('get_menu', { p_qr_token: qrToken }).then(({ data, error }) => {
      if (error) setFetchError(error.message)
      else {
        setMenu(data)
        setFetchError('')
      }
    })
  }, [qrToken, validToken])

  useEffect(() => {
    if (view === 'status') return
    loadMenu()
    const timer = setInterval(() => { if (!document.hidden) loadMenu() }, MENU_POLL_MS)
    const onVisible = () => { if (!document.hidden) loadMenu() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [view, loadMenu])

  const itemsById = useMemo(() => {
    const map = {}
    for (const item of menu?.items || []) map[item.item_id] = item
    return map
  }, [menu])
  const loadError = validToken ? fetchError : 'This QR code is not valid. Ask a staff member for help.'
  const trayCount = Object.values(tray).reduce((sum, quantity) => sum + quantity, 0)

  function addItem(id) {
    setTray((current) => ({ ...current, [id]: Math.min((current[id] || 0) + 1, MAX_QTY) }))
  }

  function changeQty(id, delta) {
    setTray((current) => {
      const quantity = (current[id] || 0) + delta
      const next = { ...current }
      if (quantity <= 0) delete next[id]
      else next[id] = Math.min(quantity, MAX_QTY)
      return next
    })
  }

  async function sendRequest() {
    setSending(true)
    setSendError('')
    const items = Object.entries(tray).map(([id, quantity]) => ({ item_id: Number(id), quantity }))
    const { data, error } = await supabase.rpc('submit_refill_request', {
      p_qr_token: qrToken,
      p_note: note.trim() || null,
      p_items: items,
    })
    setSending(false)
    if (error) {
      setSendError(error.message)
      loadMenu()
      return
    }
    setTray({})
    setNote('')
    setJustSent(data.request_number)
    setView('status')
  }

  function go(next) {
    if (next !== 'status') setJustSent('')
    setView(next)
  }

  if (!menu) {
    return (
      <div className="center-screen">
        {loadError ? (
          <>
            <h1>Menu unavailable</h1>
            <p>{loadError}</p>
            {validToken && <button type="button" className="btn secondary" onClick={loadMenu}>Try again</button>}
          </>
        ) : <p>Loading menu…</p>}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Samgyup Chada</span>
        <span className="table-badge">Table {menu.table_number}</span>
      </header>
      <main className={`content ${view === 'tray' ? 'tray-content' : ''}`}>
        <h1 className="sr-only">Samgyup Chada menu for Table {menu.table_number}</h1>
        {fetchError && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={loadMenu}>Refresh menu</button>}>{fetchError}</Notice>}
        {view === 'menu' && <MenuView items={menu.items} tray={tray} onAdd={addItem} onChangeQty={changeQty} />}
        {view === 'tray' && <TrayView itemsById={itemsById} tray={tray} note={note} setNote={setNote} onChangeQty={changeQty} onSend={sendRequest} sending={sending} error={sendError} onBrowse={() => go('menu')} />}
        {view === 'status' && <StatusView qrToken={qrToken} justSent={justSent} />}
      </main>
      {view === 'menu' && trayCount > 0 && (
        <div className="menu-review">
          <button type="button" className="btn full" onClick={() => go('tray')}>
            Review tray · {trayCount} {trayCount === 1 ? 'item' : 'items'}
          </button>
        </div>
      )}
      <nav className="bottom-nav" aria-label="Customer menu">
        <button type="button" aria-current={view === 'menu' ? 'page' : undefined} className={view === 'menu' ? 'active' : ''} onClick={() => go('menu')}>Menu</button>
        <button type="button" aria-current={view === 'tray' ? 'page' : undefined} className={view === 'tray' ? 'active' : ''} aria-label={trayCount ? `Tray, ${trayCount} items` : 'Tray'} onClick={() => go('tray')}>Tray{trayCount > 0 ? ` · ${trayCount}` : ''}</button>
        <button type="button" aria-current={view === 'status' ? 'page' : undefined} className={view === 'status' ? 'active' : ''} onClick={() => go('status')}>Status</button>
      </nav>
    </div>
  )
}

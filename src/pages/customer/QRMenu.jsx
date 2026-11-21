import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'

const CATEGORIES = [
  { key: 'meats', label: 'Meats' },
  { key: 'sides', label: 'Sides' },
  { key: 'drinks', label: 'Drinks' },
]
const STATUS_ORDER = ['sent', 'accepted', 'ready', 'served']
const STATUS_LABELS = { sent: 'Sent', accepted: 'Accepted', ready: 'Ready', served: 'Served' }
const MAX_QTY = 20
const POLL_MS = 4000 // request status refresh
const MENU_POLL_MS = 10000 // menu availability refresh
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

/* ------------------------------------------------------------------ */
/* Screen 1: QR Menu                                                   */
/* ------------------------------------------------------------------ */
function MenuView({ items, tray, onAdd }) {
  const [category, setCategory] = useState('meats')
  const visible = items.filter((i) => i.category === category)

  return (
    <>
      <p className="hint">
        Need more food? Add dishes to your tray and send a request. Staff will bring them to your
        table.
      </p>

      <div className="tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={category === c.key}
            className={`tab ${category === c.key ? 'active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="list">
        {visible.length === 0 && <li className="empty">No dishes in this category.</li>}
        {visible.map((item) => (
          <li key={item.item_id} className={`row ${item.is_available ? '' : 'unavailable'}`}>
            <div className="row-main">
              <span className="row-name">{item.item_name}</span>
              <span className={`badge ${item.is_available ? 'ok' : 'off'}`}>
                {item.is_available ? 'Available' : 'Unavailable'}
              </span>
            </div>
            <button
              className="btn small"
              disabled={!item.is_available}
              onClick={() => onAdd(item.item_id)}
            >
              Add{tray[item.item_id] ? ` (${tray[item.item_id]})` : ''}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Screen 2: Tray and Request                                          */
/* ------------------------------------------------------------------ */
function TrayView({
  itemsById,
  tray,
  note,
  setNote,
  onChangeQty,
  onSend,
  sending,
  error,
  onBrowse,
}) {
  const lines = Object.entries(tray)
    .map(([id, quantity]) => ({ id: Number(id), quantity, item: itemsById[id] }))
    .filter((l) => l.item)
  const hasUnavailable = lines.some((l) => !l.item.is_available)

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        <p>Your tray is empty.</p>
        <button className="btn" onClick={onBrowse}>
          Browse the menu
        </button>
      </div>
    )
  }

  return (
    <>
      <ul className="list">
        {lines.map(({ id, quantity, item }) => (
          <li key={id} className={`row ${item.is_available ? '' : 'unavailable'}`}>
            <div className="row-main">
              <span className="row-name">{item.item_name}</span>
              {!item.is_available && <span className="badge off">No longer available</span>}
            </div>
            <div className="qty">
              <button className="qty-btn" aria-label="Decrease" onClick={() => onChangeQty(id, -1)}>
                −
              </button>
              <span className="qty-num">{quantity}</span>
              <button
                className="qty-btn"
                aria-label="Increase"
                disabled={quantity >= MAX_QTY}
                onClick={() => onChangeQty(id, +1)}
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="field">
        <span>Note for the staff (optional)</span>
        <textarea
          rows={3}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. no spice, extra lettuce"
        />
      </label>

      {hasUnavailable && (
        <p className="error">Please remove the dishes that are no longer available.</p>
      )}
      {error && <p className="error">{error}</p>}

      <button className="btn full" disabled={sending || hasUnavailable} onClick={onSend}>
        {sending ? 'Sending…' : 'Send Request'}
      </button>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Screen 3: Request Status (refreshes itself every few seconds)       */
/* ------------------------------------------------------------------ */
function StatusView({ qrToken, justSent }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (document.hidden) return
      const { data, error } = await supabase.rpc('get_table_requests', { p_qr_token: qrToken })
      if (cancelled) return
      if (error) setError(error.message)
      else {
        setRequests(data)
        setError('')
      }
    }

    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrToken])

  return (
    <>
      {justSent && (
        <div className="success">
          Request sent! Your request number is <strong>{justSent}</strong>.
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {requests === null && !error && <p className="hint">Loading…</p>}
      {requests && requests.length === 0 && (
        <p className="empty-state">No requests from this table yet.</p>
      )}

      <ul className="list">
        {(requests || []).map((r) => {
          const idx = STATUS_ORDER.indexOf(r.status)
          return (
            <li key={r.request_number} className="request">
              <div className="request-head">
                <strong>{r.request_number}</strong>
                <span className={`tag ${r.status}`}>{STATUS_LABELS[r.status]}</span>
              </div>
              <div className="steps" aria-hidden="true">
                {STATUS_ORDER.map((s, i) => (
                  <span key={s} className={`step ${i <= idx ? 'done' : ''}`} />
                ))}
              </div>
              <ul className="request-items">
                {r.items.map((it) => (
                  <li key={it.item_name}>
                    {it.quantity} × {it.item_name}
                  </li>
                ))}
              </ul>
              {r.note && <p className="request-note">Note: {r.note}</p>}
              <p className="request-time">Sent at {formatTime(r.created_at)}</p>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function QRMenu() {
  const { qrToken } = useParams()
  const validToken = UUID_RE.test(qrToken || '')

  const [menu, setMenu] = useState(null) // { table_number, items: [...] }
  const [fetchError, setFetchError] = useState('')
  const [view, setView] = useState('menu') // 'menu' | 'tray' | 'status'
  const [tray, setTray] = useState({}) // { [item_id]: quantity }
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

  // Load when the menu or tray opens, then keep availability fresh: every 10 seconds
  // while the page is visible, and right away when the customer switches back to this tab.
  useEffect(() => {
    if (view === 'status') return // the status screen does its own polling

    loadMenu()
    const timer = setInterval(() => {
      if (!document.hidden) loadMenu()
    }, MENU_POLL_MS)
    const onVisible = () => {
      if (!document.hidden) loadMenu()
    }
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

  const loadError = validToken
    ? fetchError
    : 'This QR code is not valid. Please ask a staff member for help.'

  const trayCount = Object.values(tray).reduce((sum, q) => sum + q, 0)

  function addItem(id) {
    setTray((t) => ({ ...t, [id]: Math.min((t[id] || 0) + 1, MAX_QTY) }))
  }

  function changeQty(id, delta) {
    setTray((t) => {
      const q = (t[id] || 0) + delta
      const next = { ...t }
      if (q <= 0) delete next[id]
      else next[id] = Math.min(q, MAX_QTY)
      return next
    })
  }

  async function sendRequest() {
    setSending(true)
    setSendError('')
    const items = Object.entries(tray).map(([id, quantity]) => ({
      item_id: Number(id),
      quantity,
    }))
    const { data, error } = await supabase.rpc('submit_refill_request', {
      p_qr_token: qrToken,
      p_note: note.trim() || null,
      p_items: items,
    })
    setSending(false)

    if (error) {
      setSendError(error.message)
      loadMenu() // a dish may have just become unavailable
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
            <h1>Oops</h1>
            <p>{loadError}</p>
          </>
        ) : (
          <p>Loading menu…</p>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Samgyup Chada</span>
        <span className="table-badge">Table {menu.table_number}</span>
      </header>

      <main className="content">
        {view === 'menu' && <MenuView items={menu.items} tray={tray} onAdd={addItem} />}
        {view === 'tray' && (
          <TrayView
            itemsById={itemsById}
            tray={tray}
            note={note}
            setNote={setNote}
            onChangeQty={changeQty}
            onSend={sendRequest}
            sending={sending}
            error={sendError}
            onBrowse={() => go('menu')}
          />
        )}
        {view === 'status' && <StatusView qrToken={qrToken} justSent={justSent} />}
      </main>

      <nav className="bottom-nav">
        <button className={view === 'menu' ? 'active' : ''} onClick={() => go('menu')}>
          Menu
        </button>
        <button className={view === 'tray' ? 'active' : ''} onClick={() => go('tray')}>
          Tray{trayCount > 0 ? ` (${trayCount})` : ''}
        </button>
        <button className={view === 'status' ? 'active' : ''} onClick={() => go('status')}>
          Status
        </button>
      </nav>
    </div>
  )
}

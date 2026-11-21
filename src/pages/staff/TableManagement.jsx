import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabaseClient.js'
import './TableManagement.css'

const BASE_KEY = 'chada_qr_base'
const QR_OPTIONS = { width: 600, margin: 2, errorCorrectionLevel: 'M' }
const STATUS_LABEL = { available: 'Available', reserved: 'Reserved', dining: 'Dining' }

// The website address that goes inside the QR codes is kept in this browser.
function readBase() {
  try {
    return localStorage.getItem(BASE_KEY) || ''
  } catch {
    return ''
  }
}

function saveBase(value) {
  try {
    localStorage.setItem(BASE_KEY, value)
  } catch {
    // private browsing: the field still works, it just is not remembered
  }
}

// "chada.pages.dev/" -> "https://chada.pages.dev"; "192.168.1.5:5173" -> "http://192.168.1.5:5173"
function normalizeBase(raw) {
  let v = raw.trim().replace(/\/+$/, '')
  if (!v) return ''
  if (!/^https?:\/\//i.test(v)) {
    v = (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/i.test(v) ? 'http://' : 'https://') + v
  }
  return v
}

function friendly(error) {
  if (error.code === '23505') {
    return 'That table number is already used, maybe by a removed table. Restore that table or choose another number.'
  }
  if (error.code === '23514') return 'Table number and seats must be whole numbers above zero.'
  return error.message
}

// Why a table cannot be removed right now (empty text = it can).
async function removalBlocker(t) {
  if (t.status === 'dining') {
    return `Table ${t.table_number} has guests seated. End the session on the dashboard first.`
  }
  const { data, error } = await supabase
    .from('reservations')
    .select('reservation_code')
    .eq('table_id', t.table_id)
    .eq('status', 'approved')
  if (error) return error.message
  if (data.length > 0) {
    const codes = data.map((r) => r.reservation_code).join(', ')
    return `Table ${t.table_number} still has approved bookings (${codes}). Remove it once they are done.`
  }
  return ''
}

/* ------------------------------------------------------------------ */
/* QR code for one table                                               */
/* ------------------------------------------------------------------ */
function QrModal({ table, baseUrl, onClose, onPrint }) {
  const url = `${baseUrl}/menu/${table.qr_token}`
  const [result, setResult] = useState(null) // { url, img }

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, QR_OPTIONS)
      .then((img) => {
        if (!cancelled) setResult({ url, img })
      })
      .catch(() => {
        if (!cancelled) setResult({ url, img: '' })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const img = result?.url === url ? result.img : null // null = still drawing

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`QR code for Table ${table.table_number}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Table {table.table_number}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-qr">
          {img === null && <p className="hint">Drawing the QR code…</p>}
          {img === '' && <p className="error">Could not draw the QR code.</p>}
          {img && <img src={img} alt={`QR code for Table ${table.table_number}`} />}
          <span className="tm-url">{url}</span>
          {img && (
            <div className="tm-qr-actions">
              <a className="btn" href={img} download={`table-${table.table_number}-qr.png`}>
                Download image
              </a>
              <button className="btn secondary" onClick={() => onPrint(table)}>
                Print
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function TableManagement() {
  const [tables, setTables] = useState(null)
  const [error, setError] = useState('') // problems loading the list
  const [actionError, setActionError] = useState('') // problems with a button press; a reload must not clear it
  const [info, setInfo] = useState('')
  const [baseInput, setBaseInput] = useState(() => readBase() || window.location.origin)
  const [showRemoved, setShowRemoved] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newSeats, setNewSeats] = useState('4')
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState(null) // { id, number, seats }
  const [busyId, setBusyId] = useState(null)
  const [qrTable, setQrTable] = useState(null)
  const [printCards, setPrintCards] = useState(null) // [{ id, number, img }]

  const load = useCallback(
    () =>
      supabase
        .from('restaurant_tables')
        .select('table_id, table_number, capacity, qr_token, status, is_active')
        .order('table_number')
        .then(({ data, error }) => {
          if (error) setError(error.message)
          else {
            setTables(data)
            setError('')
          }
        }),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  // Open the browser's print dialog once the QR cards are on the page, then take them away again.
  useEffect(() => {
    if (!printCards) return
    const done = () => setPrintCards(null)
    window.addEventListener('afterprint', done, { once: true })
    const timer = setTimeout(() => window.print(), 150)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', done)
    }
  }, [printCards])

  const all = tables || []
  const activeTables = all.filter((t) => t.is_active)
  const visible = showRemoved ? all : activeTables
  const suggested = all.reduce((max, t) => Math.max(max, t.table_number), 0) + 1
  const baseUrl = normalizeBase(baseInput) || window.location.origin
  const isLocal = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/i.test(baseUrl)

  async function addTable(e) {
    e.preventDefault()
    const number = Number(newNumber || suggested)
    const seats = Number(newSeats)
    if (![number, seats].every((n) => Number.isInteger(n) && n >= 1)) {
      setInfo('')
      setActionError('Table number and seats must be whole numbers above zero.')
      return
    }
    setAdding(true)
    const { error } = await supabase
      .from('restaurant_tables')
      .insert({ table_number: number, capacity: seats })
    setAdding(false)
    if (error) {
      setInfo('')
      setActionError(friendly(error))
      return
    }
    setActionError('')
    setInfo(`Table ${number} added.`)
    setNewNumber('')
    load()
  }

  async function saveEdit() {
    const number = Number(edit.number)
    const seats = Number(edit.seats)
    if (![number, seats].every((n) => Number.isInteger(n) && n >= 1)) {
      setInfo('')
      setActionError('Table number and seats must be whole numbers above zero.')
      return
    }
    setBusyId(edit.id)
    const { data, error } = await supabase
      .from('restaurant_tables')
      .update({ table_number: number, capacity: seats })
      .eq('table_id', edit.id)
      .select('table_id')
    setBusyId(null)
    if (error || data.length === 0) {
      setInfo('')
      setActionError(error ? friendly(error) : 'The change was not saved. Check your account role.')
      return
    }
    setActionError('')
    setInfo(`Table ${number} saved.`)
    setEdit(null)
    load()
  }

  async function setActive(t, active) {
    if (
      !active &&
      !window.confirm(
        `Remove Table ${t.table_number}? It leaves the floor view and its QR code stops working. Past records are kept.`
      )
    ) {
      return
    }
    setBusyId(t.table_id)
    setInfo('')
    setActionError('')
    if (!active) {
      const blocker = await removalBlocker(t)
      if (blocker) {
        setBusyId(null)
        setActionError(blocker)
        return
      }
    }
    const { data, error } = await supabase
      .from('restaurant_tables')
      .update({ is_active: active })
      .eq('table_id', t.table_id)
      .select('table_id')
    setBusyId(null)
    if (error || data.length === 0) {
      setActionError(error ? friendly(error) : 'The change was not saved. Check your account role.')
      return
    }
    setInfo(`Table ${t.table_number} ${active ? 'restored' : 'removed'}.`)
    load()
  }

  async function printTables(list) {
    if (list.length === 0) {
      setActionError('There are no tables to print.')
      return
    }
    try {
      const cards = await Promise.all(
        list.map(async (t) => ({
          id: t.table_id,
          number: t.table_number,
          img: await QRCode.toDataURL(`${baseUrl}/menu/${t.qr_token}`, QR_OPTIONS),
        }))
      )
      setQrTable(null)
      setPrintCards(cards)
    } catch {
      setActionError('Could not draw the QR codes.')
    }
  }

  return (
    <>
      <div className="no-print">
        <div className="page-head">
          <h1>Tables and QR codes</h1>
        </div>

        <label className="field tm-base">
          <span>Website address inside the QR codes</span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value)}
            onBlur={() => saveBase(baseInput.trim())}
          />
        </label>
        {isLocal && (
          <p className="tm-warn">
            This address only works on your own computer or Wi-Fi. Before printing QR codes for the
            tables, enter the restaurant's real website address.
          </p>
        )}

        <form className="tm-add" onSubmit={addTable}>
          <label className="field">
            <span>Table number</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder={String(suggested)}
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Seats</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={newSeats}
              onChange={(e) => setNewSeats(e.target.value)}
            />
          </label>
          <button className="btn" type="submit" disabled={adding}>
            {adding ? 'Adding…' : 'Add table'}
          </button>
        </form>

        {info && <div className="success">{info}</div>}
        {(actionError || error) && <p className="error">{actionError || error}</p>}
        {tables === null && !error && <p className="hint">Loading…</p>}

        {tables && (
          <>
            <div className="tm-toolbar">
              <label className="tm-check">
                <input
                  type="checkbox"
                  checked={showRemoved}
                  onChange={(e) => setShowRemoved(e.target.checked)}
                />
                Show removed tables
              </label>
              <button
                className="btn secondary"
                disabled={activeTables.length === 0}
                onClick={() => printTables(activeTables)}
              >
                Print all QR codes
              </button>
            </div>

            {visible.length === 0 && (
              <p className="empty-state">No tables yet. Add your first table above.</p>
            )}

            {visible.length > 0 && (
              <table className="q-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Seats</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const editing = edit?.id === t.table_id
                    const busy = busyId === t.table_id
                    return (
                      <tr key={t.table_id} className={t.is_active ? '' : 'tm-removed'}>
                        <td data-label="Table">
                          {editing ? (
                            <input
                              className="tm-edit-input"
                              type="number"
                              min={1}
                              aria-label="Table number"
                              value={edit.number}
                              onChange={(e) => setEdit({ ...edit, number: e.target.value })}
                            />
                          ) : (
                            <strong>Table {t.table_number}</strong>
                          )}
                        </td>
                        <td data-label="Seats">
                          {editing ? (
                            <input
                              className="tm-edit-input"
                              type="number"
                              min={1}
                              aria-label="Seats"
                              value={edit.seats}
                              onChange={(e) => setEdit({ ...edit, seats: e.target.value })}
                            />
                          ) : (
                            t.capacity
                          )}
                        </td>
                        <td data-label="Status">
                          {t.is_active ? (
                            <span className={`tile-status ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                          ) : (
                            <span>Removed</span>
                          )}
                        </td>
                        <td data-label="Action">
                          <div className="tm-actions">
                            {editing && (
                              <>
                                <button className="btn small" disabled={busy} onClick={saveEdit}>
                                  Save
                                </button>
                                <button
                                  className="btn small secondary"
                                  disabled={busy}
                                  onClick={() => setEdit(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {!editing && t.is_active && (
                              <>
                                <button className="btn small" onClick={() => setQrTable(t)}>
                                  Show QR code
                                </button>
                                <button
                                  className="btn small secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    setEdit({
                                      id: t.table_id,
                                      number: String(t.table_number),
                                      seats: String(t.capacity),
                                    })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn small secondary"
                                  disabled={busy}
                                  onClick={() => setActive(t, false)}
                                >
                                  Remove
                                </button>
                              </>
                            )}
                            {!editing && !t.is_active && (
                              <button
                                className="btn small secondary"
                                disabled={busy}
                                onClick={() => setActive(t, true)}
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {qrTable && (
          <QrModal
            key={qrTable.table_id}
            table={qrTable}
            baseUrl={baseUrl}
            onClose={() => setQrTable(null)}
            onPrint={(t) => printTables([t])}
          />
        )}
      </div>

      {printCards && (
        <div className="print-sheet">
          {printCards.map((c) => (
            <div className="print-card" key={c.id}>
              <div className="print-brand">Samgyup Chada</div>
              <div className="print-table">Table {c.number}</div>
              <img src={c.img} alt={`QR code for Table ${c.number}`} />
              <div className="print-hint">Scan to see the menu and ask for refills</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

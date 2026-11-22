import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabaseClient.js'
import Modal from '../../components/Modal.jsx'
import { confirmDialog } from '../../components/dialogs.js'
import { Field, Notice, PageToolbar } from '../../components/ui.jsx'
import { getSiteBaseUrl, isLocalAddress } from '../../lib/siteUrl.js'
import './TableManagement.css'

const QR_OPTIONS = { width: 600, margin: 2, errorCorrectionLevel: 'M' }

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

function AddTableModal({ suggested, adding, onClose, onAdd }) {
  const [newNumber, setNewNumber] = useState('')
  const [newSeats, setNewSeats] = useState('4')
  const [error, setError] = useState('')

  async function submit(event) {
    const message = await onAdd(event, newNumber, newSeats)
    if (message) setError(message)
    else onClose()
  }

  return (
    <Modal title="Add table" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Table number" type="number" min={1} inputMode="numeric" placeholder={String(suggested)} autoFocus value={newNumber} onChange={(event) => setNewNumber(event.target.value)} />
        <Field label="Seats" type="number" min={1} inputMode="numeric" value={newSeats} onChange={(event) => setNewSeats(event.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn full" type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add table'}</button>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* QR code for one table                                               */
/* ------------------------------------------------------------------ */
function LocalQrNotice({ hostname }) {
  if (!hostname) return null
  return <Notice tone="warn">These QR codes point to {hostname}, which only works on this computer. Open the live site and print them from there.</Notice>
}

function QrModal({ table, baseUrl, localHostname, onClose, onPrint }) {
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


  const img = result?.url === url ? result.img : null // null = still drawing

  return (
    <Modal title={`Table ${table.table_number}`} onClose={onClose}>
      <LocalQrNotice hostname={localHostname} />
      <div className="tm-qr">
        {img === null && <p className="hint">Drawing the QR code…</p>}
        {img === '' && <p className="error">Could not draw the QR code.</p>}
        {img && <img src={img} alt={`QR code for Table ${table.table_number}`} />}
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
    </Modal>
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
  const [showRemoved, setShowRemoved] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
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
  const removedTables = all.filter((t) => !t.is_active)
  const visible = showRemoved ? all : activeTables
  const suggested = all.reduce((max, t) => Math.max(max, t.table_number), 0) + 1
  const baseUrl = getSiteBaseUrl()
  const localHostname = isLocalAddress(baseUrl) ? new URL(baseUrl).hostname.replace(/^\[|\]$/g, '') : ''

  async function addTable(e, newNumber, newSeats) {
    e.preventDefault()
    const number = Number(newNumber || suggested)
    const seats = Number(newSeats)
    if (![number, seats].every((n) => Number.isInteger(n) && n >= 1)) {
      setInfo('')
      return 'Table number and seats must be whole numbers above zero.'
    }
    setAdding(true)
    const { error } = await supabase
      .from('restaurant_tables')
      .insert({ table_number: number, capacity: seats })
    setAdding(false)
    if (error) {
      setInfo('')
      return friendly(error)
    }
    setActionError('')
    setInfo(`Table ${number} added.`)
    load()
    return ''
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
      !(await confirmDialog({
        title: `Remove Table ${t.table_number}?`,
        message: 'It leaves the floor view and its QR code stops working. Past records are kept.',
        confirmLabel: 'Remove table',
      }))
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
    if (!active) setEdit(null)
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
        <PageToolbar
          title="Tables and QR codes"
          action={(
            <div className="tm-toolbar">
              <button className="btn" type="button" disabled={activeTables.length === 0} onClick={() => printTables(activeTables)}>Print all QR codes</button>
              <button className="btn secondary" type="button" onClick={() => { setInfo(''); setActionError(''); setAddOpen(true) }}>Add table</button>
            </div>
          )}
        />

        {all.length > 0 && <LocalQrNotice hostname={localHostname} />}
        {info && <div className="success">{info}</div>}
        {(actionError || error) && <Notice tone="warn" action={<button className="btn secondary small" type="button" onClick={load}>Try again</button>}>{actionError || error}</Notice>}
        {tables === null && !error && <p className="hint">Loading tables…</p>}

        {tables && (
          <>
            {visible.length === 0 && (
              <p className="empty-state">No tables yet. Add your first table from the toolbar.</p>
            )}

            {visible.length > 0 && <ul className="tm-list">
              {visible.map((table) => {
                const editing = edit?.id === table.table_id
                const busy = busyId === table.table_id
                return (
                  <li key={table.table_id} className={`tm-row ${table.is_active ? '' : 'tm-removed'}`}>
                    <div className="tm-row-main">
                      {editing ? (
                        <div className="tm-edit">
                          <label className="field"><span>Table number</span><input className="tm-edit-input" type="number" min={1} aria-label="Table number" value={edit.number} onChange={(event) => setEdit({ ...edit, number: event.target.value })} /></label>
                          <label className="field"><span>Seats</span><input className="tm-edit-input" type="number" min={1} aria-label="Seats" value={edit.seats} onChange={(event) => setEdit({ ...edit, seats: event.target.value })} /></label>
                        </div>
                      ) : <><strong className="tm-table-title">Table {table.table_number}</strong><span className="tm-capacity">{table.capacity} seats</span>{!table.is_active && <span className="tm-removed-label">Removed</span>}</>}
                    </div>
                    <div className="tm-actions">
                      {editing && <>
                        <button className="btn small" type="button" disabled={busy} onClick={saveEdit}>Save</button>
                        <button className="btn small secondary" type="button" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
                        {table.is_active && <button className="btn small danger" type="button" disabled={busy} onClick={() => setActive(table, false)}>Remove</button>}
                      </>}
                      {!editing && table.is_active && <>
                        <button className="btn small secondary" type="button" onClick={() => setQrTable(table)}>Show QR code</button>
                        <button className="btn small ghost" type="button" disabled={busy} onClick={() => setEdit({ id: table.table_id, number: String(table.table_number), seats: String(table.capacity) })}>Edit</button>
                      </>}
                      {!editing && !table.is_active && <button className="btn small secondary" type="button" disabled={busy} onClick={() => setActive(table, true)}>Restore</button>}
                    </div>
                  </li>
                )
              })}
            </ul>}
            {removedTables.length > 0 && <button className="btn ghost small tm-removed-toggle" type="button" aria-expanded={showRemoved} onClick={() => setShowRemoved((value) => !value)}>{showRemoved ? 'Hide' : 'Show'} removed tables ({removedTables.length})</button>}
          </>
        )}

        {addOpen && <AddTableModal suggested={suggested} adding={adding} onClose={() => setAddOpen(false)} onAdd={addTable} />}

        {qrTable && (
          <QrModal
            key={qrTable.table_id}
            table={qrTable}
            baseUrl={baseUrl}
            localHostname={localHostname}
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

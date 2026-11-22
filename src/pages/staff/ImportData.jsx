import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../supabaseClient.js'
import { FileDrop, Notice, PageToolbar } from '../../components/ui.jsx'
import { downloadText } from '../../lib/download.js'
import { IMPORT_TYPES, MAX_ROWS, existingKey, planImport } from '../../lib/importRules.js'
import './ImportData.css'

const MAX_BYTES = 1024 * 1024 // 1 MB is far more than a menu needs
const SHOW_ROWS = 50 // how many problem rows are listed on screen

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // "Item_Name " and "\ufeffitem_name" both become "item_name"
      transformHeader: (h) => h.replace(/^\ufeff/, '').trim().toLowerCase(),
      complete: resolve,
      error: reject,
    })
  })
}

function preview(typeKey, data) {
  const d = data || {}
  return typeKey === 'menu'
    ? `${d.item_name || '(blank)'} · ${d.category || '(blank)'}`
    : `Table ${d.table_number || '(blank)'} · ${d.capacity || '(blank)'} seats`
}

export default function ImportData() {
  const [typeKey, setTypeKey] = useState('menu')
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0) // changing it clears the file picker
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState(null)

  const type = IMPORT_TYPES[typeKey]

  function chooseType(next) {
    setTypeKey(next)
    setFile(null)
    setFileKey((k) => k + 1)
    setOutcome(null)
    setError('')
  }

  async function runImport() {
    if (!file) return
    setBusy(true)
    setError('')
    setOutcome(null)
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.')
      if (file.size > MAX_BYTES) throw new Error('The file is larger than 1 MB. Check that it is the right file.')

      const parsed = await parseCsv(file)
      const fields = parsed.meta.fields || []
      const missing = type.required.filter((c) => !fields.includes(c))
      if (missing.length > 0) {
        throw new Error(
          `The first row of the file must have the columns ${type.columns.join(', ')}. Missing: ${missing.join(', ')}.`
        )
      }
      if (parsed.data.length === 0) throw new Error('The file has no rows to import.')
      if (parsed.data.length > MAX_ROWS) {
        throw new Error(`The file has ${parsed.data.length} rows. Import at most ${MAX_ROWS} at a time.`)
      }

      // what is already saved, so repeat uploads do not create duplicates
      const { data: existing, error: loadError } = await supabase.from(type.table).select('*')
      if (loadError) throw new Error(loadError.message)
      const existingKeys = new Set(existing.map((r) => existingKey(typeKey, r)))

      const { records, skipped, failed } = planImport(typeKey, parsed.data, existingKeys)

      // one insert for all good rows: either all of them are saved or none
      if (records.length > 0) {
        const { error: insertError } = await supabase.from(type.table).insert(records)
        if (insertError) {
          throw new Error(
            insertError.code === '23505'
              ? 'Something in the file was added by someone else while it was being checked. Nothing was imported. Try again.'
              : insertError.message
          )
        }
      }

      // activity log entry; the import itself already worked, so a problem here is only a warning
      const { error: logError } = await supabase.rpc('log_import', {
        p_record_type: type.table,
        p_imported: records.length,
        p_skipped: skipped.length,
        p_failed: failed.length,
      })

      setOutcome({
        typeKey,
        fileName: file.name,
        fields,
        imported: records.length,
        skipped,
        failed,
        logWarning: Boolean(logError),
      })
      setFile(null)
      setFileKey((k) => k + 1)
    } catch (e) {
      setError(e.message || 'The file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  function downloadFailed() {
    const columns = [...new Set([...outcome.fields, 'error'])]
    const rows = outcome.failed.map((f) => ({ ...f.data, error: f.reason }))
    const base = outcome.fileName.replace(/\.csv$/i, '')
    downloadText(`${base}_failed_rows.csv`, Papa.unparse(rows, { columns }))
  }

  const problems = outcome
    ? [
        ...outcome.failed.map((f) => ({ ...f, kind: 'failed' })),
        ...outcome.skipped.map((s) => ({ ...s, kind: 'skipped' })),
      ].sort((a, b) => a.row - b.row)
    : []

  return (
    <>
      <PageToolbar title="Import data" />

      <section className="imp-card">
        <div className="filters">
          {Object.entries(IMPORT_TYPES).map(([key, t]) => (
            <button
              key={key}
              className={`chip ${typeKey === key ? 'active' : ''}`}
              onClick={() => chooseType(key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="imp-help">
          The first row of the file holds the column names:{' '}
          <strong>{type.columns.join(', ')}</strong>.{' '}
          {typeKey === 'menu'
            ? 'Category must be meats, sides, or drinks. '
            : 'Table number and capacity must be whole numbers above zero. '}
          {type.columns[2]} is optional and must be yes or no (blank means yes).
        </p>

        <div className="imp-actions">
          <button
            className="btn secondary"
            type="button"
            onClick={() => downloadText(type.fileName, type.template)}
          >
            Download an example file
          </button>
        </div>

        <div className="field">
          <span>CSV file</span>
          <FileDrop
            file={file}
            inputKey={fileKey}
            onFile={(next) => { setFile(next); setOutcome(null) }}
            onError={setError}
          />
        </div>

        <button className="btn" type="button" disabled={!file || busy} onClick={runImport}>
          {busy ? 'Importing…' : `Import ${type.label.toLowerCase()}`}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {outcome && (
        <section className="imp-card" aria-live="polite">
          <h2>Import finished</h2>
          <p className="hint">{outcome.fileName}</p>

          <p className="imp-result">{outcome.imported} valid · {outcome.skipped.length} skipped · {outcome.failed.length} {outcome.failed.length === 1 ? 'error' : 'errors'}</p>

          {outcome.imported > 0 && outcome.typeKey === 'tables' && (
            <Notice tone="info">
              New tables need QR codes. Open Tables &amp; QR to show or print them, and check the
              website address first.
            </Notice>
          )}
          {outcome.logWarning && (
            <p className="hint">The rows were saved, but the activity log entry could not be written.</p>
          )}

          {problems.length > 0 && (
            <>
              <div className="imp-table-wrap">
              <table className="q-table imp-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Value</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.slice(0, SHOW_ROWS).map((p) => (
                    <tr key={`${p.kind}-${p.row}`}>
                      <td>{p.row}</td>
                      <td>{preview(outcome.typeKey, p.data)}</td>
                      <td>
                        <strong>{p.kind === 'failed' ? 'Failed' : 'Skipped'}.</strong> {p.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="hint">
                Row 1 is the first row under the column names.
                {problems.length > SHOW_ROWS && ` Showing the first ${SHOW_ROWS} of ${problems.length}.`}
              </p>
            </>
          )}

          {outcome.failed.length > 0 && (
            <button className="btn secondary" type="button" onClick={downloadFailed}>
              Download the failed rows
            </button>
          )}
        </section>
      )}
    </>
  )
}

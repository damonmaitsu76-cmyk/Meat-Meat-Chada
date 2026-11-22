import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { Notice, PageToolbar } from '../../components/ui.jsx'
import { fmtTime } from '../../lib/dates.js'
import './Settings.css'

const KEYS = ['arrival_grace_minutes', 'slot_length_minutes', 'opening_time', 'closing_time']
// Used only if a setting row is missing from the database (the same values as supabase/sql/08_seed.sql).
const DEFAULTS = {
  arrival_grace_minutes: '15',
  slot_length_minutes: '90',
  opening_time: '11:00',
  closing_time: '23:00',
}
const SETTING_LABELS = {
  arrival_grace_minutes: 'arrival grace period',
  slot_length_minutes: 'time slot length',
  opening_time: 'opening time',
  closing_time: 'closing time',
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function clockPlus(hhmm, mins) {
  const t = (toMinutes(hhmm) + mins) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// Numbers are saved without stray spaces or zeros ("015" -> "15"); times as HH:MM.
function clean(d) {
  return {
    arrival_grace_minutes: String(Number(d.arrival_grace_minutes)),
    slot_length_minutes: String(Number(d.slot_length_minutes)),
    opening_time: d.opening_time,
    closing_time: d.closing_time,
  }
}

// Returns a message for the first problem, or '' when the values are fine.
function validate(d) {
  const grace = Number(d.arrival_grace_minutes)
  const slot = Number(d.slot_length_minutes)
  if (!Number.isInteger(grace) || grace < 1 || grace > 120) {
    return 'The grace period must be a whole number from 1 to 120 minutes.'
  }
  if (!Number.isInteger(slot) || slot < 30 || slot > 240) {
    return 'The time slot length must be a whole number from 30 to 240 minutes.'
  }
  if (!/^\d{2}:\d{2}$/.test(d.opening_time) || !/^\d{2}:\d{2}$/.test(d.closing_time)) {
    return 'Enter both the opening time and the closing time.'
  }
  const span = toMinutes(d.closing_time) - toMinutes(d.opening_time)
  if (span <= 0) return 'The closing time must be later than the opening time on the same day.'
  if (span < slot) return 'The time slot is longer than the opening hours, so nothing could be booked.'
  return ''
}

export default function Settings() {
  const [saved, setSaved] = useState(null) // what the database holds
  const [draft, setDraft] = useState(null) // what the form shows
  const [error, setError] = useState('') // problems loading
  const [actionError, setActionError] = useState('') // problems saving
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)

  // keepDraft = true after a failed save, so what the manager typed is not thrown away
  const load = useCallback(
    (keepDraft = false) =>
      supabase
        .from('settings')
        .select('setting_key, setting_value')
        .in('setting_key', KEYS)
        .then(({ data, error }) => {
          if (error) {
            setError(error.message)
            return
          }
          const values = { ...DEFAULTS }
          for (const row of data) values[row.setting_key] = row.setting_value
          // times may come back as 11:00:00; the time input wants 11:00
          values.opening_time = values.opening_time.slice(0, 5)
          values.closing_time = values.closing_time.slice(0, 5)
          setSaved(values)
          if (!keepDraft) setDraft(values)
          setError('')
        }),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  const dirty = saved && draft && JSON.stringify(clean(draft)) !== JSON.stringify(saved)

  function change(key, value) {
    setInfo('')
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function save(e) {
    e.preventDefault()
    const problem = validate(draft)
    if (problem) {
      setInfo('')
      setActionError(problem)
      return
    }
    const next = clean(draft)
    const changed = KEYS.filter((k) => next[k] !== saved[k])
    if (changed.length === 0) return

    setSaving(true)
    const results = await Promise.all(
      changed.map((k) =>
        supabase
          .from('settings')
          .update({ setting_value: next[k] })
          .eq('setting_key', k)
          .select('setting_key')
      )
    )
    setSaving(false)

    const failedIndex = results.findIndex((r) => r.error || r.data.length === 0)
    if (failedIndex !== -1) {
      const r = results[failedIndex]
      setInfo('')
      setActionError(
        r.error
          ? r.error.message
          : `The setting "${changed[failedIndex]}" was not saved. Check your account role, and that supabase/sql/08_seed.sql was run.`
      )
      load(true)
      return
    }
    setActionError('')
    setInfo(`Saved ${changed.map((key) => SETTING_LABELS[key]).join(', ')}. The new values apply right away.`)
    setDraft(next)
    setSaved(next)
  }

  const grace = Number(draft?.arrival_grace_minutes)
  const slot = Number(draft?.slot_length_minutes)

  return (
    <>
      <PageToolbar title="Settings" />

      {info && <div className="success">{info}</div>}
      {(actionError || error) && <Notice tone="warn" action={<button type="button" className="btn secondary small" onClick={() => load()}>Try again</button>}>{actionError || error}</Notice>}
      {draft === null && !error && <p className="hint">Loading settings…</p>}

      {draft && (
        <form className="set-form" onSubmit={save}>
          <section className="set-card">
            <h2>Reservations</h2>

            <label className="field">
              <span>Arrival grace period (minutes)</span>
              <input
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                value={draft.arrival_grace_minutes}
                onChange={(e) => change('arrival_grace_minutes', e.target.value)}
              />
            </label>
            <p className="set-help">
              A guest who has not arrived this long after the booked time is counted as a no-show
              and the table is released.
              {Number.isInteger(grace) && grace >= 1 && ' '}
              {Number.isInteger(grace) &&
                grace >= 1 &&
                `Example: a 6:00 PM booking is released at ${fmtTime(clockPlus('18:00', grace))}.`}
            </p>

            <label className="field">
              <span>Time slot length (minutes)</span>
              <input
                type="number"
                min={30}
                max={240}
                inputMode="numeric"
                value={draft.slot_length_minutes}
                onChange={(e) => change('slot_length_minutes', e.target.value)}
              />
            </label>
          </section>

          <section className="set-card">
            <h2>Opening hours</h2>
            <div className="set-row">
              <label className="field">
                <span>Opens</span>
                <input
                  type="time"
                  value={draft.opening_time}
                  onChange={(e) => change('opening_time', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Closes</span>
                <input
                  type="time"
                  value={draft.closing_time}
                  onChange={(e) => change('closing_time', e.target.value)}
                />
              </label>
            </div>
          </section>

          <div className="set-actions">
            <button className="btn" type="submit" disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={saving || !dirty}
              onClick={() => {
                setDraft(saved)
                setActionError('')
                setInfo('')
              }}
            >
              Undo changes
            </button>
          </div>
        </form>
      )}
    </>
  )
}

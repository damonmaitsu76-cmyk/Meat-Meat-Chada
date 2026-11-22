import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { confirmDialog } from '../../components/dialogs.js'
import Modal from '../../components/Modal.jsx'
import { Field, Notice, PageToolbar, Segmented, Switch } from '../../components/ui.jsx'
import { useAuth } from '../../auth/AuthContext.js'
import { ADMIN_ROLES } from '../../auth/roles.js'
import './MenuManagement.css'

const CATEGORIES = [
  { key: 'meats', label: 'Meats' },
  { key: 'sides', label: 'Sides' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'add-on', label: 'Add-ons' },
]
const SAFETY_POLL_MS = 30000 // in case the live connection silently drops

let channelSeq = 0

function friendly(error) {
  if (error.code === '23505') return 'That dish already exists in this category.'
  if (error.code === '23514') return 'Enter a dish name.'
  return error.message
}

function AddDishModal({ adding, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('meats')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const message = await onAdd({ name, category })
    if (message) setError(message)
    else onClose()
  }

  return (
    <Modal title="Add dish" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Dish name" type="text" maxLength={80} required autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        <div className="field"><span>Category</span><Segmented label="Category" items={CATEGORIES} value={category} onChange={setCategory} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn full" type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add dish'}</button>
      </form>
    </Modal>
  )
}

export default function MenuManagement() {
  const { profile } = useAuth()
  const canEdit = ADMIN_ROLES.includes(profile.role) // staff only get the availability switches

  const [items, setItems] = useState(null)
  const [error, setError] = useState('') // problems loading the list
  const [actionError, setActionError] = useState('') // problems with a button press; a reload must not clear it
  const [info, setInfo] = useState('')
  const [live, setLive] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState(null) // { id, name, category }

  const load = useCallback(
    () =>
      supabase
        .from('menu_items')
        .select('item_id, item_name, category, is_available')
        .order('item_name')
        .then(({ data, error }) => {
          if (error) setError(error.message)
          else {
            setItems(data)
            setError('')
          }
        }),
    []
  )

  // Load, then stay up to date: Supabase Realtime pushes a change, we reload the list.
  useEffect(() => {
    load()
    const channel = supabase
      .channel(`menu-items-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, load)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, SAFETY_POLL_MS)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [load])

  async function toggle(item) {
    setInfo('')
    setBusyId(item.item_id)
    // switch right away; the reload below puts things right if the change was refused
    setItems((list) =>
      list.map((i) => (i.item_id === item.item_id ? { ...i, is_available: !i.is_available } : i))
    )
    const { error } = await supabase.rpc('set_dish_availability', {
      p_item_id: item.item_id,
      p_available: !item.is_available,
    })
    setBusyId(null)
    setActionError(error ? error.message : '')
    load()
  }

  async function addDish({ name: dishName, category }) {
    const name = dishName.trim()
    if (!name) {
      setInfo('')
      return 'Enter a dish name.'
    }
    setAdding(true)
    const { error } = await supabase
      .from('menu_items')
      .insert({ item_name: name, category })
    setAdding(false)
    if (error) {
      setInfo('')
      return friendly(error)
    }
    setActionError('')
    setInfo(`${name} added.`)
    load()
    return ''
  }

  async function saveEdit() {
    const name = edit.name.trim()
    if (!name) {
      setInfo('')
      setActionError('Enter a dish name.')
      return
    }
    setBusyId(edit.id)
    const { data, error } = await supabase
      .from('menu_items')
      .update({ item_name: name, category: edit.category })
      .eq('item_id', edit.id)
      .select('item_id')
    setBusyId(null)
    if (error || data.length === 0) {
      setInfo('')
      setActionError(error ? friendly(error) : 'The change was not saved. Check your account role.')
      return
    }
    setActionError('')
    setInfo(`${name} saved.`)
    setEdit(null)
    load()
  }

  async function remove(item) {
    if (
      !(await confirmDialog({
        title: `Delete ${item.item_name}?`,
        message: 'It leaves the menu for good. Past requests keep its name.',
        confirmLabel: 'Delete dish',
      }))
    ) {
      return
    }
    setBusyId(item.item_id)
    setInfo('')
    const { data, error } = await supabase
      .from('menu_items')
      .delete()
      .eq('item_id', item.item_id)
      .select('item_id')
    setBusyId(null)
    if (error || data.length === 0) {
      setActionError(error ? friendly(error) : 'The dish was not deleted. Check your account role.')
      return
    }
    setActionError('')
    setInfo(`${item.item_name} deleted.`)
    load()
  }

  const all = items || []

  return (
    <>
      <PageToolbar
        title="Menu"
        live={live}
        action={canEdit && <button className="btn" type="button" onClick={() => { setInfo(''); setActionError(''); setAddOpen(true) }}>Add dish</button>}
      />

      {addOpen && <AddDishModal adding={adding} onClose={() => setAddOpen(false)} onAdd={addDish} />}
      {info && <div className="success">{info}</div>}
      {(actionError || error) && <Notice tone="warn" action={!items ? <button className="btn secondary small" type="button" onClick={load}>Try again</button> : undefined}>{actionError || error}</Notice>}
      {items === null && !error && <p className="hint">Loading dishes…</p>}

      {items &&
        CATEGORIES.map((c) => {
          const list = all.filter((i) => i.category === c.key)
          const unavailable = list.filter((i) => !i.is_available).length
          return (
            <section className="mm-section" key={c.key}>
              <h2>
                {c.label}{unavailable > 0 && <small className="mm-unavailable">{unavailable} unavailable</small>}
              </h2>

              {list.length === 0 && <p className="empty-state">No dishes in this category.</p>}

              {list.length > 0 && <ul className="mm-list">
                {list.map((item) => {
                  const editing = edit?.id === item.item_id
                  const busy = busyId === item.item_id
                  return (
                    <li key={item.item_id} className={`mm-row ${item.is_available ? '' : 'mm-off'}`}>
                      {editing ? (
                        <div className="mm-edit">
                          <input className="mm-edit-input" type="text" maxLength={80} aria-label="Dish name" value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} />
                          <Segmented label="Category" items={CATEGORIES} value={edit.category} onChange={(category) => setEdit({ ...edit, category })} />
                          <div className="mm-actions">
                            <button className="btn small" type="button" disabled={busy} onClick={saveEdit}>Save</button>
                            <button className="btn small secondary" type="button" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
                            <button className="btn small danger" type="button" disabled={busy} onClick={() => remove(item)}>Delete</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="mm-name">{item.item_name}</span>
                          <div className="mm-row-actions">
                            <div className="mm-avail">
                              {!item.is_available && <span className="mm-state">Unavailable</span>}
                              <Switch checked={item.is_available} label={`Set ${item.item_name} availability`} disabled={busy} onChange={() => toggle(item)} />
                            </div>
                            {canEdit && <button className="btn ghost small" type="button" disabled={busy} onClick={() => setEdit({ id: item.item_id, name: item.item_name, category: item.category })}>Edit</button>}
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>}
            </section>
          )
        })}
    </>
  )
}

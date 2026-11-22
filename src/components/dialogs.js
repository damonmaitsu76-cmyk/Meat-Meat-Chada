// The store behind confirmDialog() and promptDialog(). DialogHost.jsx draws what is in it.
//   const ok = await confirmDialog({ title, message, confirmLabel, cancelLabel })  -> true or false
//   const text = await promptDialog({ title, label, confirmLabel })                -> string, or null if closed
let current = null
let nextId = 1
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCurrent() {
  return current
}

export function closeCurrent(value) {
  const spec = current
  if (!spec) return
  current = null
  emit()
  spec.resolve(value)
}

function open(spec) {
  if (current) closeCurrent(current.kind === 'prompt' ? null : false)
  return new Promise((resolve) => {
    current = { ...spec, id: nextId++, resolve }
    emit()
  })
}

export const confirmDialog = (options) => open({ kind: 'confirm', ...options })
export const promptDialog = (options) => open({ kind: 'prompt', ...options })

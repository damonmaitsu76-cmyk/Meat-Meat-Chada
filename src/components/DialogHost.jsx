import { useState, useSyncExternalStore } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { useLeaveAsGhost } from '../lib/exitGhost.js'
import { closeCurrent, getCurrent, subscribe } from './dialogs.js'

// Mount once, next to <App />. It shows whatever confirmDialog() / promptDialog() asked for.

function Confirm({ spec }) {
  const { overlayRef, contentRef } = useLeaveAsGhost()
  const noMessage = spec.message ? {} : { 'aria-describedby': undefined }
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && getCurrent() === spec) closeCurrent(false)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay ref={overlayRef} className="backdrop" />
        <AlertDialog.Content ref={contentRef} className="modal modal-small" {...noMessage}>
          <AlertDialog.Title className="modal-title">{spec.title}</AlertDialog.Title>
          {spec.message && (
            <AlertDialog.Description className="modal-text">{spec.message}</AlertDialog.Description>
          )}
          <div className="modal-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="btn secondary">
                {spec.cancelLabel || 'Keep it'}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button type="button" className={`btn ${spec.danger ? 'danger' : ''}`} onClick={() => closeCurrent(true)}>
                {spec.confirmLabel || 'Confirm'}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

function Prompt({ spec }) {
  const { overlayRef, contentRef } = useLeaveAsGhost()
  const [value, setValue] = useState('')
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && getCurrent() === spec) closeCurrent(null)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay ref={overlayRef} className="backdrop" />
        <Dialog.Content ref={contentRef} className="modal modal-small" aria-describedby={undefined}>
          <Dialog.Title className="modal-title">{spec.title}</Dialog.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              closeCurrent(value.trim())
            }}
          >
            <label className="field">
              <span>{spec.label}</span>
              <input
                type="text"
                maxLength={spec.maxLength || 200}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <Dialog.Close asChild>
                <button type="button" className="btn secondary">
                  {spec.cancelLabel || 'Back'}
                </button>
              </Dialog.Close>
              <button type="submit" className="btn">
                {spec.confirmLabel || 'Confirm'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function DialogHost() {
  const spec = useSyncExternalStore(subscribe, getCurrent)
  if (!spec) return null
  return spec.kind === 'prompt' ? <Prompt key={spec.id} spec={spec} /> : <Confirm key={spec.id} spec={spec} />
}

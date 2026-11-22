import * as Dialog from '@radix-ui/react-dialog'

// A window over the page. Escape, a click outside and the x all call onClose.
// Focus stays inside while it is open and goes back to the button that opened it.
export default function Modal({ title, onClose, children }) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="modal-close" aria-label="Close">
              ×
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

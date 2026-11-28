import * as Dialog from '@radix-ui/react-dialog'
import { useLeaveAsGhost } from '../lib/exitGhost.js'
import './Modal.css'

// A window over the page. Escape, a click outside and the x all call onClose.
// Focus stays inside while it is open and goes back to the button that opened it.
// The title bar stays in place and only the body scrolls, so long content never slides
// out of sight under the rounded corners.
// When it closes it plays a short exit (see exitGhost.js).
export default function Modal({ title, onClose, children }) {
  const { overlayRef, contentRef } = useLeaveAsGhost()
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay ref={overlayRef} className="backdrop" />
        <Dialog.Content ref={contentRef} className="modal modal-scroll" aria-describedby={undefined}>
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="modal-close" aria-label="Close">
              ×
            </Dialog.Close>
          </div>
          <div className="modal-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

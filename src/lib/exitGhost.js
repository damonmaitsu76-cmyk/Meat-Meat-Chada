import { useLayoutEffect, useRef } from 'react'

// React removes a closed dialog from the page in one step, so it cannot play a closing animation.
// This keeps a copy of the dialog on screen for a moment, plays the exit on the copy, and removes it.
// It works for every way a dialog can close (x, Escape, a click outside, or the screen that opened
// it dropping the dialog), because it only looks at what React is about to remove.
//
// The copy is for the eye only: no ids, hidden from screen readers, and not clickable.
// motion.css animates anything marked [data-leaving]. Keep EXIT_MS in step with --t-exit in tokens.css.
const EXIT_MS = 200

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function copyForExit(node) {
  const ghost = node.cloneNode(true)
  for (const element of [ghost, ...ghost.querySelectorAll('[id]')]) element.removeAttribute('id')
  ghost.removeAttribute('tabindex')
  ghost.setAttribute('data-leaving', '')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  return ghost
}

export function leaveAsGhost(...nodes) {
  const live = nodes.filter(Boolean)
  if (live.length === 0 || prefersReducedMotion()) return
  const ghosts = live.map(copyForExit)
  // React takes the real nodes out right after this runs. If they are still attached a moment later
  // (React's development-mode practice unmount, for one), nothing was closed, so the copies are dropped.
  queueMicrotask(() => {
    if (live.some((node) => node.isConnected)) return
    document.body.append(...ghosts)
    setTimeout(() => ghosts.forEach((ghost) => ghost.remove()), EXIT_MS + 80)
  })
}

// const { overlayRef, contentRef } = useLeaveAsGhost()
// <Dialog.Overlay ref={overlayRef} /> <Dialog.Content ref={contentRef} />
export function useLeaveAsGhost() {
  const nodes = useRef({ overlay: null, content: null })
  useLayoutEffect(() => {
    const held = nodes.current
    // Layout cleanups run before React detaches the nodes, so both are still here.
    return () => leaveAsGhost(held.overlay, held.content)
  }, [])
  return {
    overlayRef: (element) => { nodes.current.overlay = element },
    contentRef: (element) => { nodes.current.content = element },
  }
}

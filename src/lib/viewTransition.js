import { flushSync } from 'react-dom'

// Click handler for a router link. Where the browser supports View Transitions (and the person has
// not asked for less motion), the navigation runs inside one, so motion.css can animate the page change.
// Everywhere else it does nothing, and the link behaves exactly as before.
//   <Link to="/reserve" onClick={withViewTransition(navigate, '/reserve')}>
//
// While the callback below is pending, the browser stops painting, and animation frames stop with it.
// So the callback must never wait for requestAnimationFrame: that wait never ends, the page looks
// frozen, and after 4 seconds the browser aborts with "TimeoutError: ... DOM update timed out".
// It waits for React to change the page instead, and gives up quickly if nothing changes.
const MAX_WAIT_MS = 300

// A transition that is skipped or interrupted rejects its promises. Nobody needs to hear about it.
const ignore = () => {}

function isCurrentPage(to) {
  try {
    const target = new URL(to, window.location.href)
    return target.pathname === window.location.pathname && target.search === window.location.search
  } catch {
    return false
  }
}

export function withViewTransition(navigate, to) {
  return (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (typeof document.startViewTransition !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (isCurrentPage(to)) return // nothing will change, so there is nothing to animate

    event.preventDefault()
    const transition = document.startViewTransition(
      () =>
        new Promise((resolve) => {
          const root = document.getElementById('root')
          const observer = new MutationObserver(() => finish())
          const timer = setTimeout(() => finish(), MAX_WAIT_MS)
          function finish() {
            observer.disconnect()
            clearTimeout(timer)
            resolve()
          }
          if (root) observer.observe(root, { childList: true, subtree: true })
          navigate(to)
        })
    )
    transition.ready.catch(ignore)
    transition.finished.catch(ignore)
    transition.updateCallbackDone.catch(ignore)
  }
}

// For a change on one page (the form turning into the reservation ticket, say): the old content
// fades out while the new content fades in. flushSync makes React change the page inside the
// callback, so the browser can take the "after" picture straight away.
//   showTransition(() => setSaved(next))
export function showTransition(update) {
  if (typeof document.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  const transition = document.startViewTransition(() => { flushSync(update) })
  transition.ready.catch(ignore)
  transition.finished.catch(ignore)
  transition.updateCallbackDone.catch(ignore)
}

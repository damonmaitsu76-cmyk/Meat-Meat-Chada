// Click handler for a router link. Where the browser supports View Transitions (and the person has
// not asked for less motion), the navigation runs inside one, so motion.css can animate the page change.
// Everywhere else it does nothing, and the link behaves exactly as before.
//   <Link to="/reserve" onClick={withViewTransition(navigate, '/reserve')}>
export function withViewTransition(navigate, to) {
  return (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (typeof document.startViewTransition !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    event.preventDefault()
    document.startViewTransition(
      () =>
        new Promise((resolve) => {
          const root = document.getElementById('root')
          // Wait until React has put the new page in the DOM, then one more frame so it has been laid out.
          const observer = new MutationObserver(() => finish())
          const finish = () => {
            observer.disconnect()
            requestAnimationFrame(() => resolve())
          }
          if (root) observer.observe(root, { childList: true, subtree: true })
          navigate(to)
          setTimeout(finish, 400) // never leave the page frozen if nothing changes
        })
    )
  }
}

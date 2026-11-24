import { useCallback, useState } from 'react'

// Notices that staff have closed. They are remembered on this device, so a closed notice
// stays closed after a refresh instead of coming back.
const STORAGE_KEY = 'chada_dismissed_notices'
const KEEP = 200 // the newest 200 are kept, so the list cannot grow without end

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // The notice still closes for this visit when the browser blocks storage.
  }
}

// One key per released no-show, so the Dashboard and Reservations screens share it.
export const noShowKey = (reservation) => `noshow:${reservation.reservation_id}`

export default function useDismissed() {
  const [dismissed, setDismissed] = useState(read)
  const dismiss = useCallback(
    (keys) => {
      const next = [...new Set([...dismissed, ...keys])].slice(-KEEP)
      write(next)
      setDismissed(next)
    },
    [dismissed]
  )
  return [dismissed, dismiss]
}

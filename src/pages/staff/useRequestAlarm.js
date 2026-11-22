import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { isRequestAlarmUnlocked, playRequestAlarm, unlockRequestAlarm } from '../../lib/requestAlarm.js'

let channelSeq = 0

// A touchscreen tap is counted by the browser when the finger lifts (touchend), not when it
// lands, so listening for a pointer press would never unlock sound on a phone or tablet.
const TAP_EVENTS = ['touchend', 'click', 'keydown']

// Rings on this device whenever a customer sends a new request from a table.
// Returns true while the browser is blocking sound; a tap or click turns it on.
export default function useRequestAlarm() {
  const [blocked, setBlocked] = useState(
    () => !isRequestAlarmUnlocked() && navigator.userActivation?.hasBeenActive !== true
  )

  useEffect(() => {
    const channel = supabase
      .channel(`request-alarm-${++channelSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'refill_requests' }, () => {
        playRequestAlarm().then((played) => setBlocked(!played))
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    let active = true
    function unlock() {
      unlockRequestAlarm().then((ok) => {
        if (active && ok) setBlocked(false)
      })
    }
    // capture phase, so a screen that stops the tap from bubbling cannot block the unlock
    TAP_EVENTS.forEach((name) => window.addEventListener(name, unlock, true))
    // The page was already tapped (the log in button, say): try now instead of waiting for another tap.
    if (navigator.userActivation?.hasBeenActive) unlock()
    return () => {
      active = false
      TAP_EVENTS.forEach((name) => window.removeEventListener(name, unlock, true))
    }
  }, [])

  return blocked
}

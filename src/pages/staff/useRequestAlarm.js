import { useEffect } from 'react'
import { supabase } from '../../supabaseClient.js'
import { playRequestAlarm, unlockRequestAlarm } from '../../lib/requestAlarm.js'

let channelSeq = 0

// A touchscreen tap is counted by the browser when the finger lifts (touchend), not when it
// lands, so listening for a pointer press would never unlock sound on a phone or tablet.
const TAP_EVENTS = ['touchend', 'click', 'keydown']

// Rings on this device whenever a customer sends a new request from a table.
export default function useRequestAlarm() {
  useEffect(() => {
    const channel = supabase
      .channel(`request-alarm-${++channelSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'refill_requests' }, () => {
        playRequestAlarm().then((played) => {
          if (!played) console.warn('The browser blocked the request alarm. Click or tap the page once to allow sound.')
        })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Staff tap the screen all the time, so any tap or click lets the browser allow sound.
  useEffect(() => {
    const unlock = () => unlockRequestAlarm()
    // capture phase, so a screen that stops the tap from bubbling cannot block the unlock
    TAP_EVENTS.forEach((name) => window.addEventListener(name, unlock, true))
    // The page was already tapped (the log in button, say): unlock now instead of waiting for another tap.
    if (navigator.userActivation?.hasBeenActive) unlock()
    return () => {
      TAP_EVENTS.forEach((name) => window.removeEventListener(name, unlock, true))
    }
  }, [])
}

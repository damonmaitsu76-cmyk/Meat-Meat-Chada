// The sound staff hear when a customer sends a new request from a table.
// It is an MP3 because every browser plays MP3, including Safari on iPhone and iPad.
//
// Browsers only allow sound after the person has tapped or clicked the page, and iPhones
// and iPads want that tap to start the audio itself. unlockRequestAlarm() does that: it
// plays the sound silently once, from inside a tap. It is called from the log in button
// and from the first tap or click on any staff screen (see useRequestAlarm.js).
import alarmUrl from '../assets/8am-alarm.mp3'

let audio = null
let unlocked = false
let pendingUnlock = null

function getAudio() {
  if (!audio) {
    audio = new Audio(alarmUrl)
    audio.preload = 'auto'
  }
  return audio
}

async function silentPlay() {
  const a = getAudio()
  try {
    a.muted = true
    await a.play()
    a.pause()
    a.currentTime = 0
    unlocked = true
    return true
  } catch {
    return false
  } finally {
    a.muted = false
  }
}

// true when later alarms are allowed to make sound.
export function unlockRequestAlarm() {
  if (unlocked) return Promise.resolve(true)
  if (!pendingUnlock) {
    pendingUnlock = silentPlay().finally(() => {
      pendingUnlock = null
    })
  }
  return pendingUnlock
}

// true when the sound started (or is already ringing), false when the browser blocked it.
export async function playRequestAlarm() {
  const a = getAudio()
  if (pendingUnlock) await pendingUnlock
  if (!a.paused) return true // a second request while it rings lets the alarm finish, not restart
  try {
    a.muted = false
    a.currentTime = 0
    await a.play()
    unlocked = true
    return true
  } catch {
    unlocked = false
    return false
  }
}

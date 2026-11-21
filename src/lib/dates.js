// Date helpers for the reservation screens.
// The restaurant runs on Philippine time (UTC+8, no daylight saving), and the database
// stores reservation_date and reservation_time as local Philippine time.

const MANILA = 'Asia/Manila'

// Today's date in Manila as 'YYYY-MM-DD'.
export function manilaDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: MANILA })
}

// 'YYYY-MM-DD' plus or minus some days.
export function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// '13:30:00' -> '1:30 PM'
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// '2026-11-22' -> 'Sunday, November 22, 2026'
export function fmtDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// Short label for lists: 'Today', 'Tomorrow', or 'Sun, Nov 22'.
export function dayLabel(ymd, today) {
  if (ymd === today) return 'Today'
  if (ymd === shiftDate(today, 1)) return 'Tomorrow'
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// When a reservation starts, as a timestamp in milliseconds.
export function startMs(date, time) {
  return new Date(`${date}T${time}+08:00`).getTime()
}

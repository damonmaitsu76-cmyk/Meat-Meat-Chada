// Pure helpers for the staff floor view: what each table says, how its chairs fill,
// and the plain-language lines in the Needs attention list.
import { dayLabel, fmtTime, startMs } from './dates.js'
import { displayName, formatDuration } from './format.js'

export const MAX_SEATS_SHOWN = 12

export function minutesSince(iso, now) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

// 'just now' or '12 min ago'
export function agoText(minutes) {
  return minutes < 1 ? 'just now' : `${formatDuration(minutes)} ago`
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`
}

// Keeps a number and its unit on one line ('8 min', '8:00 PM'), so a wrapped line never starts with 'PM'.
export function glue(text) {
  return text.replace(/(\d) (min|h|AM|PM)\b/g, '$1 $2')
}

// How a table reads on the floor: dining (guests seated), reserved (held), or open.
export function tileTone(table, session) {
  if (session || table.status === 'dining') return 'dining'
  if (table.status === 'reserved') return 'reserved'
  return 'open'
}

// What a tile says about its table. An open table with no booking says nothing.
export function tileDetails(table, session, booking) {
  const tone = tileTone(table, session)
  const none = { tone, state: '', name: '', party: 0, time: '' }
  if (session) {
    return { ...none, state: 'Dining', name: displayName(session.guest_name), party: session.party_size }
  }
  if (tone === 'dining') return { ...none, state: 'Dining' }
  if (booking) {
    return {
      tone,
      state: tone === 'reserved' ? 'Held' : 'Booked',
      name: displayName(booking.customer_name),
      party: booking.guest_count,
      time: fmtTime(booking.reservation_time),
    }
  }
  if (tone === 'reserved') return { ...none, state: 'Reserved' }
  return none
}

// Chairs along the two long sides of the table. Guests fill them in facing pairs,
// so a party of three takes two seats on one side and one opposite. true = taken.
export function seatLayout(capacity, taken) {
  const shown = Math.max(0, Math.min(capacity, MAX_SEATS_SHOWN))
  const filled = Math.max(0, Math.min(taken, shown))
  const top = []
  const bottom = []
  for (let index = 0; index < shown; index += 1) {
    ;(index % 2 === 0 ? top : bottom).push(index < filled)
  }
  return { top, bottom }
}

export function summarizeFloor(tables, sessionByTable) {
  const summary = { dining: 0, reserved: 0, open: 0, guests: 0 }
  for (const table of tables) {
    const session = sessionByTable[table.table_id]
    summary[tileTone(table, session)] += 1
    if (session) summary.guests += session.party_size
  }
  return summary
}

// 'Table 8', 'Tables 3 and 8', 'Tables 3, 8 and 11', 'Tables 3, 8, 11 and 2 more'
export function tableList(numbers, limit = 3) {
  if (numbers.length === 0) return ''
  const shown = numbers.slice(0, limit)
  const extra = numbers.length - shown.length
  const label = numbers.length === 1 ? 'Table' : 'Tables'
  if (extra > 0) return `${label} ${shown.join(', ')} and ${extra} more`
  if (shown.length > 1) return `${label} ${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return `${label} ${shown[0]}`
}

// The line under "Active refill requests": which tables, and how long the oldest has waited.
export function requestSummary(requests, tablesById, now) {
  const numbers = new Set()
  let oldest = Infinity
  for (const request of requests) {
    const table = tablesById[request.table_id]
    if (table) numbers.add(table.table_number)
    const created = new Date(request.created_at).getTime()
    if (Number.isFinite(created)) oldest = Math.min(oldest, created)
  }
  const waited = Number.isFinite(oldest) ? agoText(Math.max(0, Math.floor((now - oldest) / 60000))) : ''
  const tables = tableList([...numbers].sort((a, b) => a - b))
  const requested = waited && (requests.length > 1 ? `oldest requested ${waited}` : `requested ${waited}`)
  return [tables, requested].filter(Boolean).join(' · ')
}

// The pending reservation that starts first, or null.
export function nextReservation(reservations) {
  const byStart = (a, b) =>
    startMs(a.reservation_date, a.reservation_time) - startMs(b.reservation_date, b.reservation_time)
  return [...reservations].sort(byStart)[0] || null
}

// 'Dela Cruz, party of 4 · Today, 7:30 PM'
export function reservationLine(reservation, today) {
  return (
    `${displayName(reservation.customer_name)}, party of ${reservation.guest_count} · ` +
    `${dayLabel(reservation.reservation_date, today)}, ${fmtTime(reservation.reservation_time)}`
  )
}

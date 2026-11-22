import { fmtTime } from '../../lib/dates.js'
import { displayName, formatDuration } from '../../lib/format.js'

const MAX_SEATS_SHOWN = 12

function minutesSince(iso, now) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

function guestsText(count) {
  return `${count} ${count === 1 ? 'guest' : 'guests'}`
}

// One table on the floor view: its number, its chairs, and a state block only when something is happening.
export default function FloorTile({ table, session, booking, requestCount, now, onSelect }) {
  const seatCount = Math.min(table.capacity, MAX_SEATS_SHOWN)
  const taken = session ? Math.min(session.party_size, seatCount) : 0

  let state = ''
  let guest = ''
  if (session) {
    state = 'Dining'
    guest = `${displayName(session.guest_name)} · ${guestsText(session.party_size)}`
  } else if (booking) {
    state = table.status === 'reserved' ? 'Held' : 'Booked'
    guest = `${displayName(booking.customer_name)} · ${fmtTime(booking.reservation_time)}`
  } else if (table.status === 'reserved') {
    state = 'Reserved'
  }

  const spoken = [
    `Table ${table.table_number}`,
    `${table.capacity} seats`,
    table.status,
    guest.replace(' · ', ', '),
    requestCount > 0 ? `${requestCount} open ${requestCount === 1 ? 'request' : 'requests'}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button className={`tile ${table.status}`} type="button" aria-label={spoken} onClick={onSelect}>
      <span className="tile-head">
        <span className="tile-label">Table</span>
        <strong className="tile-number">{table.table_number}</strong>
      </span>

      <span className="tile-seats" aria-hidden="true" style={{ '--seat-rows': seatCount > 4 ? 2 : 1 }}>
        {Array.from({ length: seatCount }, (_, index) => (
          <span key={index} className={`seat ${index < taken ? 'taken' : ''}`} />
        ))}
      </span>

      {state && (
        <span className="tile-state">
          <span className="tile-state-row">
            <span className="tile-state-word">{state}</span>
            {session && <span className="ticket tile-timer">{formatDuration(minutesSince(session.seated_at, now))}</span>}
          </span>
          {guest && <span className="tile-guest">{guest}</span>}
        </span>
      )}

      {requestCount > 0 && (
        <span className="tile-requests">
          {requestCount} {requestCount === 1 ? 'request' : 'requests'}
        </span>
      )}
    </button>
  )
}
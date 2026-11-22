import { formatDuration } from '../../lib/format.js'
import { agoText, minutesSince, plural, seatLayout, tileDetails } from '../../lib/floor.js'
import './Dashboard.css'

// Chairs along one long side of the table. Decorative: the tile's label carries the same facts.
function Seats({ side, seats }) {
  if (seats.length === 0) return null
  return (
    <span className={`seats ${side}`} aria-hidden="true">
      {seats.map((taken, index) => (
        <span key={index} className={`seat ${taken ? 'taken' : ''}`} />
      ))}
    </span>
  )
}

// One table on the floor. An open table is a dashed outline, like a table drawn on a plan;
// a table in use fills in, with a ticket-style block that says who is there and for how long.
export default function FloorTile({ table, session, booking, requestCount, now, onSelect }) {
  const { tone, state, name, party, time } = tileDetails(table, session, booking)
  const seats = seatLayout(table.capacity, session ? session.party_size : 0)
  const seated = session ? minutesSince(session.seated_at, now) : null
  const stamp = seated !== null ? formatDuration(seated) : time

  const spoken = [
    `Table ${table.table_number}`,
    plural(table.capacity, 'seat', 'seats'),
    state ? state.toLowerCase() : 'available',
    name,
    party > 0 ? plural(party, 'guest', 'guests') : '',
    seated !== null ? `seated ${agoText(seated)}` : time,
    requestCount > 0 ? `${plural(requestCount, 'open refill request', 'open refill requests')}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button className={`tile ${tone}`} type="button" aria-label={spoken} onClick={onSelect}>
      <Seats side="top" seats={seats.top} />
      <Seats side="bottom" seats={seats.bottom} />

      <span className="tile-head">
        <span className="tile-id">
          <span className="tile-label">Table</span>
          <strong className="tile-number">{table.table_number}</strong>
        </span>
        {requestCount > 0 && <span className="tile-flag">{plural(requestCount, 'refill', 'refills')}</span>}
      </span>

      {state ? (
        <span key={tone} className="tile-foot">
          <span className="tile-state-row">
            <span className="tile-state-word">{state}</span>
            {stamp && <span className="ticket tile-stamp">{stamp}</span>}
          </span>
          {name && <span className="tile-guest">{name}</span>}
          {party > 0 && <span className="tile-party">{plural(party, 'guest', 'guests')}</span>}
        </span>
      ) : (
        <span className="tile-capacity">{plural(table.capacity, 'seat', 'seats')}</span>
      )}
    </button>
  )
}

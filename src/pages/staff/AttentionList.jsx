import { Link } from 'react-router-dom'
import { glue, nextReservation, requestSummary, reservationLine } from '../../lib/floor.js'
import './Dashboard.css'

function Chevron() {
  return (
    <svg className="attention-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Row({ to, count, label, detail }) {
  return (
    <li>
      <Link className="attention-row" to={to} aria-label={`${count} ${label}${detail ? `. ${detail}` : ''}`}>
        <strong className="attention-count">{count}</strong>
        <span className="attention-text">
          <span className="attention-label">{label}</span>
          {detail && <span className="attention-detail">{detail}</span>}
        </span>
        <Chevron />
      </Link>
    </li>
  )
}

// Only what needs a person right now. When there is nothing, the whole section is absent.
export default function AttentionList({ requests, pendingReservations, tablesById, today, now }) {
  if (requests.length === 0 && pendingReservations.length === 0) return null

  const next = nextReservation(pendingReservations)
  const waiting = pendingReservations.length

  return (
    <section className="attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Needs attention</h2>
      <ul className="attention-list">
        {requests.length > 0 && (
          <Row
            to="/staff/requests"
            count={requests.length}
            label={`Active ${requests.length === 1 ? 'request' : 'requests'}`}
            detail={glue(requestSummary(requests, tablesById, now))}
          />
        )}
        {waiting > 0 && (
          <Row
            to="/staff/reservations"
            count={waiting}
            label={`${waiting === 1 ? 'Reservation' : 'Reservations'} waiting for approval`}
            detail={glue(`${waiting > 1 ? 'Earliest: ' : ''}${reservationLine(next, today)}`)}
          />
        )}
      </ul>
    </section>
  )
}

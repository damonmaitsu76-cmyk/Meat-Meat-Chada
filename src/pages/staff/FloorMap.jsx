import { EmptyState } from '../../components/ui.jsx'
import { plural, summarizeFloor } from '../../lib/floor.js'
import FloorTile from './FloorTile.jsx'
import './Dashboard.css'

// The room: a heading with a one-line count, then every active table in number order.
export default function FloorMap({ tables, sessionByTable, bookingsByTable, requestCountByTable, slotMinutes, now, onSelect }) {
  const summary = summarizeFloor(tables, sessionByTable)

  return (
    <section className="floor-section" aria-labelledby="floor-title">
      <div className="floor-heading">
        <h2 id="floor-title">Floor</h2>
        {tables.length > 0 && (
          <p className="floor-summary">
            {summary.guests > 0 && <span><strong>{plural(summary.guests, 'guest', 'guests')}</strong> dining</span>}
            {summary.reserved > 0 && <span><strong>{summary.reserved}</strong> reserved</span>}
            <span><strong>{summary.open}</strong> open</span>
          </p>
        )}
      </div>

      {tables.length === 0 ? (
        <EmptyState>No active tables. Add tables in Tables &amp; QR.</EmptyState>
      ) : (
        <ul className="floor">
          {tables.map((table) => (
            <li key={table.table_id}>
              <FloorTile
                table={table}
                session={sessionByTable[table.table_id]}
                booking={(bookingsByTable[table.table_id] || [])[0]}
                requestCount={requestCountByTable[table.table_id] || 0}
                slotMinutes={slotMinutes}
                now={now}
                onSelect={() => onSelect(table.table_id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

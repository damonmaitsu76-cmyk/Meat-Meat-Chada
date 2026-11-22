import { useState } from 'react'
import { Button, Disclosure, EmptyState, Field, FilterTabs, LiveIndicator, Notice, PageToolbar, RecordCard, ResponsiveRecords, StatusChip, Stepper, Switch } from '../components/ui.jsx'
import { manilaDate, shiftDate } from '../lib/dates.js'
import AttentionList from './staff/AttentionList.jsx'
import FloorMap from './staff/FloorMap.jsx'
import './DesignFixture.css'

const LONG_NAME = 'Alexandria Maria Dela Cruz-Santos, Junior'

// Every floor state in one room: open, booked later, held, reserved, dining, a long name,
// several requests, and a table with more chairs than the drawing shows.
function floorFixture(now) {
  const minutesAgo = (minutes) => new Date(now - minutes * 60000).toISOString()
  const today = manilaDate(new Date(now))
  const table = (table_number, capacity, status = 'available') => ({ table_id: table_number, table_number, capacity, status })
  const tables = [
    table(1, 2), table(2, 2), table(3, 4), table(4, 4, 'dining'), table(5, 4, 'reserved'),
    table(6, 6, 'dining'), table(7, 6, 'reserved'), table(8, 8), table(9, 12, 'dining'), table(10, 14),
  ]
  const session = (table_id, guest_name, party_size, minutes, source = 'walk_in') => ({ session_id: table_id, table_id, guest_name, party_size, source, seated_at: minutesAgo(minutes) })
  const sessionByTable = {
    4: session(4, 'Gays', 3, 12),
    6: session(6, LONG_NAME, 6, 94, 'reservation'),
    9: session(9, 'RAMOS FAMILY', 9, 0),
  }
  const bookingsByTable = {
    2: [{ reservation_id: 1, reservation_code: 'CH-7QW2LD', customer_name: 'Reyes', guest_count: 2, reservation_time: '19:30:00' }],
    5: [{ reservation_id: 2, reservation_code: 'CH-3ZKSLD', customer_name: 'MARIA DELA CRUZ', guest_count: 4, reservation_time: '18:45:00' }],
  }
  const requests = [
    { request_id: 1, table_id: 4, status: 'sent', created_at: minutesAgo(3) },
    { request_id: 2, table_id: 6, status: 'accepted', created_at: minutesAgo(8) },
    { request_id: 3, table_id: 6, status: 'ready', created_at: minutesAgo(2) },
  ]
  const requestCountByTable = { 4: 1, 6: 2 }
  const pendingReservations = [
    { reservation_id: 3, reservation_code: 'CH-9HT4PA', customer_name: 'Lee', guest_count: 2, reservation_date: shiftDate(today, 1), reservation_time: '11:00:00', status: 'pending' },
    { reservation_id: 4, reservation_code: 'CH-5BN8XC', customer_name: 'DELA CRUZ', guest_count: 4, reservation_date: today, reservation_time: '20:00:00', status: 'pending' },
  ]
  const tablesById = Object.fromEntries(tables.map((t) => [t.table_id, t]))
  return { today, tables, tablesById, sessionByTable, bookingsByTable, requests, requestCountByTable, pendingReservations }
}
const REQUEST_ITEMS = Array.from({ length: 12 }, (_, index) => ({ name: `Grill item ${index + 1}`, quantity: index % 3 + 1 }))
const MANY_RECORDS = Array.from({ length: 120 }, (_, index) => ({ key: `fixture-${index + 1}`, name: `Guest ${String(index + 1).padStart(3, '0')}`, party: index % 8 + 1 }))

export default function DesignFixture() {
  const [filter, setFilter] = useState('active')
  const [quantity, setQuantity] = useState(2)
  const [available, setAvailable] = useState(true)
  const [now] = useState(() => Date.now())
  const floor = floorFixture(now)
  const quietTables = floor.tables.slice(0, 8).map((t) => ({ ...t, status: 'available' }))
  const manyRecords = MANY_RECORDS.map((record) => ({
    key: record.key,
    card: <RecordCard title={record.name} subtitle={`Party of ${record.party} · Tomorrow 6:00 PM`} status={<StatusChip status="pending" />} meta={<span className="ticket">CH-3ZKSLD</span>} />,
    cells: [record.name, record.party, 'Tomorrow 6:00 PM', <span className="ticket">CH-3ZKSLD</span>, <StatusChip status="pending" />],
  }))

  return (
    <main className="design-fixture">
      <PageToolbar title="Design fixture" live={false} />
      <header className="fixture-staff-top"><span className="brand">Samgyup Chada</span><span className="staff-user"><span className="staff-identity">manager</span><LiveIndicator live={false} /></span></header>
      <h2 className="fixture-heading">Components and states</h2>

      <section className="fixture-section">
        <h3>Buttons and fields</h3>
        <div className="fixture-actions">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost action</Button>
          <Button variant="danger">Danger action</Button>
          <Button disabled>Unavailable action</Button>
          <Button>Saving…</Button>
        </div>
        <div className="fixture-field-grid">
          <Field label="Guest name" hint="Name shown to the floor team" defaultValue={LONG_NAME} />
          <Field label="Invalid field" error="Enter a valid value and try again." />
          <label className="field"><span>Party size</span><select defaultValue="4"><option>2</option><option>4</option><option>6</option></select></label>
          <label className="field"><span>Note for staff</span><textarea defaultValue="No spice, please." /></label>
        </div>
      </section>

      <section className="fixture-section">
        <h3>Status chips</h3>
        <div className="fixture-actions">
          <StatusChip status="sent" />
          <StatusChip status="accepted" />
          <StatusChip status="ready" />
          <StatusChip status="served" />
          <StatusChip status="pending" />
          <StatusChip status="approved" />
          <StatusChip status="arrived" />
          <StatusChip status="declined" />
          <StatusChip status="cancelled" />
          <StatusChip status="auto_cancelled" />
        </div>
      </section>

      <section className="fixture-section">
        <h3>Notices and filters</h3>
        <Notice tone="info">Your changes are saved.</Notice>
        <Notice tone="warn" action={<Button variant="secondary" size="small">Try again</Button>}>The request could not be loaded. Check the connection and retry.</Notice>
        <FilterTabs label="Fixture request filters" items={[{ key: 'active', label: 'Active', count: 3 }, { key: 'new', label: 'New', count: 0 }, { key: 'served', label: 'Served', count: 12 }]} value={filter} onChange={setFilter} />
      </section>

      <section className="fixture-section">
        <h3>Controls</h3>
        <div className="fixture-actions">
          <Stepper value={quantity} label="Marinated pork" min={0} max={20} onChange={(delta) => setQuantity((current) => Math.max(0, Math.min(20, current + delta)))} />
          <Switch checked={available} label="Marinated pork availability" onChange={() => setAvailable((current) => !current)} />
          {!available && <span className="fixture-state-warn">Unavailable</span>}
          <Disclosure label="Add dish"><Button variant="secondary">Add dish</Button></Disclosure>
        </div>
      </section>

      <section className="fixture-section">
        <h3>Loading, access, and empty states</h3>
        <div className="fixture-state-grid">
          <p className="hint">Loading requests…</p>
          <Notice tone="warn" action={<Button variant="secondary" size="small">Try again</Button>}>The floor could not be loaded.</Notice>
          <div className="fixture-no-access"><strong>Not allowed</strong><p>Your account does not have access to this page.</p></div>
          <EmptyState>No open requests.</EmptyState>
          <p className="fixture-state-empty">No tables yet. Add your first table from the toolbar.</p>
        </div>
      </section>

      <section className="fixture-section">
        <h3>Request ticket with 12 items</h3>
        <RecordCard
          className="fixture-ticket"
          title="Table 8"
          subtitle={<><span className="ticket">R-0004</span><span> · 6:42 PM</span></>}
          status={<StatusChip status="ready" />}
          meta={<span>{LONG_NAME}</span>}
          actions={<Button className="full">Mark served</Button>}
        >
          <ul className="fixture-items">{REQUEST_ITEMS.map((item) => <li key={item.name}><span>{item.quantity}</span> × {item.name}</li>)}</ul>
          <p className="hint">Served in 14 min</p>
        </RecordCard>
      </section>

      <section className="fixture-section" id="floor-fixture">
        <h3>Floor with every table state</h3>
        <AttentionList
          requests={floor.requests}
          pendingReservations={floor.pendingReservations}
          tablesById={floor.tablesById}
          today={floor.today}
          now={now}
        />
        <FloorMap
          tables={floor.tables}
          sessionByTable={floor.sessionByTable}
          bookingsByTable={floor.bookingsByTable}
          requestCountByTable={floor.requestCountByTable}
          slotMinutes={90}
          now={now}
          onSelect={() => {}}
        />
      </section>

      <section className="fixture-section" id="floor-quiet-fixture">
        <h3>Quiet floor</h3>
        <FloorMap tables={quietTables} sessionByTable={{}} bookingsByTable={{}} requestCountByTable={{}} now={now} onSelect={() => {}} />
      </section>

      <section className="fixture-section">
        <h3>Zero records</h3>
        <EmptyState>No reservations match this filter. Check the date or search and try again.</EmptyState>
      </section>

      <section className="fixture-section fixture-large-list">
        <h3>120 records</h3>
        <div className="fixture-record-scroll">
          <ResponsiveRecords headers={['Guest', 'Party', 'When', 'ID', 'Status']} records={manyRecords} />
        </div>
      </section>
    </main>
  )
}

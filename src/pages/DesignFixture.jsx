import { useState } from 'react'
import { Button, Disclosure, EmptyState, Field, FilterTabs, LiveIndicator, Notice, PageToolbar, RecordCard, ResponsiveRecords, StatusChip, Stepper, Switch } from '../components/ui.jsx'
import './DesignFixture.css'

const LONG_NAME = 'Alexandria Maria Dela Cruz-Santos, Junior'
const REQUEST_ITEMS = Array.from({ length: 12 }, (_, index) => ({ name: `Grill refill item ${index + 1}`, quantity: index % 3 + 1 }))
const MANY_RECORDS = Array.from({ length: 120 }, (_, index) => ({ key: `fixture-${index + 1}`, name: `Guest ${String(index + 1).padStart(3, '0')}`, party: index % 8 + 1 }))

export default function DesignFixture() {
  const [filter, setFilter] = useState('active')
  const [quantity, setQuantity] = useState(2)
  const [available, setAvailable] = useState(true)
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
      <p className="hint">A local fixture for the restaurant interface. It uses sample records and does not load restaurant data.</p>

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
          <Disclosure label="Add dish"><p className="hint">A rarely used form can sit behind this disclosure.</p><Button variant="secondary">Add dish</Button></Disclosure>
        </div>
      </section>

      <section className="fixture-section">
        <h3>Loading, access, and empty states</h3>
        <div className="fixture-state-grid">
          <p className="hint">Loading requests…</p>
          <Notice tone="warn" action={<Button variant="secondary" size="small">Try again</Button>}>The floor could not be loaded.</Notice>
          <div className="fixture-no-access"><strong>Not allowed</strong><p>Your account does not have access to this page.</p></div>
          <EmptyState>No open requests. New ones appear here live.</EmptyState>
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

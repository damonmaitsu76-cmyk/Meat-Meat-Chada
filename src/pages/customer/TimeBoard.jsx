import { fmtTime } from '../../lib/dates.js'

const PARTS = [
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'dinner', label: 'Dinner' },
]

const partOf = (time) => (time < '14:00:00' ? 'lunch' : time < '17:00:00' ? 'afternoon' : 'dinner')

// Every time of the day on one board, split into lunch, afternoon and dinner. Times that are full
// (or already past) stay on the board, struck through, so the shape of the day is visible and
// nothing hides behind a tab.
export default function TimeBoard({ slots, loading, chosen, onChoose }) {
  const parts = PARTS
    .map((part) => ({ ...part, slots: slots.filter((slot) => partOf(slot.slot_time) === part.key) }))
    .filter((part) => part.slots.length > 0)

  return (
    <div className="board" aria-busy={loading || undefined}>
      {parts.map((part) => {
        const open = part.slots.filter((slot) => slot.is_open).length
        return (
          <section key={part.key} className="board-part" aria-label={part.label}>
            <h3 className="board-heading">
              <span>{part.label}</span>
              <span className="leader" aria-hidden="true" />
              <small>{open === 0 ? 'Full' : `${open} open`}</small>
            </h3>
            <div className="board-slots">
              {part.slots.map((slot) => {
                const selected = chosen === slot.slot_time
                return (
                  <button
                    key={slot.slot_time}
                    type="button"
                    className={`slot ${selected ? 'selected' : ''}`.trim()}
                    disabled={!slot.is_open || loading}
                    aria-pressed={selected}
                    onClick={() => onChoose(slot.slot_time)}
                  >
                    {fmtTime(slot.slot_time)}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { dayParts, fmtDate, shiftDate } from '../../lib/dates.js'

const QUICK_DAYS = 7

function Calendar() {
  return (
    <svg className="day-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

// The next seven days to tap, and one more tile that opens the phone's own date picker for
// anything further out, up to the booking limit.
export default function DayStrip({ today, max, value, onChange, labelledBy }) {
  const picker = useRef(null)
  const moreTile = useRef(null)
  const days = Array.from({ length: QUICK_DAYS }, (_, index) => shiftDate(today, index))
  const farther = Boolean(value) && !days.includes(value)

  // A date picked from the calendar lives in the last tile; bring it into view.
  useEffect(() => {
    if (farther) moreTile.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [farther, value])

  function openPicker() {
    const input = picker.current
    if (!input) return
    try { input.showPicker() } catch { input.focus(); input.click() }
  }

  const far = farther ? dayParts(value) : null
  return (
    <div className="day-strip" role="group" aria-labelledby={labelledBy}>
      {days.map((ymd, index) => {
        const { weekday, day, month } = dayParts(ymd)
        const selected = value === ymd
        return (
          <button key={ymd} type="button" className={`day ${selected ? 'selected' : ''}`.trim()} aria-pressed={selected} aria-label={fmtDate(ymd)} onClick={() => onChange(ymd)}>
            <span className="day-name">{index === 0 ? 'Today' : weekday}</span>
            <strong className="day-number">{day}</strong>
            <span className="day-month">{month}</span>
          </button>
        )
      })}
      <span className="day-more" ref={moreTile}>
        <button
          type="button"
          className={`day ${farther ? 'selected' : ''}`.trim()}
          aria-pressed={farther}
          aria-label={farther ? `${fmtDate(value)}. Choose a different date` : 'Choose another date'}
          onClick={openPicker}
        >
          {far ? (
            <>
              <span className="day-name">{far.weekday}</span>
              <strong className="day-number">{far.day}</strong>
              <span className="day-month">{far.month}</span>
            </>
          ) : (
            <>
              <span className="day-name">Later</span>
              <Calendar />
              <span className="day-month">Pick</span>
            </>
          )}
        </button>
        <input
          ref={picker}
          className="sr-only"
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={today}
          max={max}
          value={value}
          onChange={(event) => { if (event.target.value) onChange(event.target.value) }}
        />
      </span>
    </div>
  )
}

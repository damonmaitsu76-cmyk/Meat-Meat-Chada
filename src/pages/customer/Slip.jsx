import { fmtDay, fmtTime } from '../../lib/dates.js'

const TICKS = Array.from({ length: 12 }, (_, index) => index * 30)

// A small clock that shows the chosen time. Decorative: the slip beside it says the same thing in words.
function Clock({ time }) {
  const [hours, minutes] = time ? time.split(':').map(Number) : [12, 0]
  return (
    <svg className={`clock ${time ? '' : 'unset'}`.trim()} viewBox="0 0 48 48" aria-hidden="true">
      <circle className="clock-face" cx="24" cy="24" r="22" />
      {TICKS.map((angle) => <line key={angle} className="clock-tick" x1="24" y1="5" x2="24" y2="7.5" style={{ transform: `rotate(${angle}deg)` }} />)}
      <line className="clock-hand hour" x1="24" y1="24" x2="24" y2="13.5" style={{ transform: `rotate(${((hours % 12) + minutes / 60) * 30}deg)` }} />
      <line className="clock-hand minute" x1="24" y1="24" x2="24" y2="8.5" style={{ transform: `rotate(${minutes * 6}deg)` }} />
      <circle className="clock-pin" cx="24" cy="24" r="2.2" />
    </svg>
  )
}

// What the booking will say, in words, before it is sent.
export default function Slip({ date, time, guests }) {
  return (
    <div className="slip">
      <Clock time={time} />
      <div className="slip-text">
        <strong className="slip-day">{date ? fmtDay(date) : 'Choose a date'}</strong>
        <span className="slip-detail">
          {time ? fmtTime(time) : 'Choose a time'} · {guests} {guests === 1 ? 'guest' : 'guests'}
        </span>
      </div>
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import {
  agoText,
  glue,
  minutesOver,
  nextReservation,
  requestSummary,
  reservationLine,
  seatLayout,
  summarizeFloor,
  tableList,
  tileDetails,
  tileTone,
} from './floor.js'

const table = (overrides = {}) => ({ table_id: 1, table_number: 1, capacity: 4, status: 'available', ...overrides })

describe('tileTone', () => {
  it('prefers a seated session over the stored status', () => {
    expect(tileTone(table(), { party_size: 2 })).toBe('dining')
    expect(tileTone(table({ status: 'dining' }), undefined)).toBe('dining')
  })

  it('maps reserved and available tables', () => {
    expect(tileTone(table({ status: 'reserved' }), undefined)).toBe('reserved')
    expect(tileTone(table(), undefined)).toBe('open')
  })
})

describe('tileDetails', () => {
  const booking = { customer_name: 'MARIA DELA CRUZ', guest_count: 4, reservation_time: '19:30:00' }

  it('says nothing for an open table with no booking', () => {
    expect(tileDetails(table(), undefined, undefined)).toEqual({ tone: 'open', state: '', name: '', party: 0, time: '' })
  })

  it('describes the seated party', () => {
    const session = { guest_name: 'Gays', party_size: 3 }
    expect(tileDetails(table({ status: 'dining' }), session, undefined)).toMatchObject({
      tone: 'dining',
      state: 'Dining',
      name: 'Gays',
      party: 3,
    })
  })

  it('tells a booked open table from a held one', () => {
    expect(tileDetails(table(), undefined, booking)).toMatchObject({
      tone: 'open',
      state: 'Booked',
      name: 'Maria Dela Cruz',
      party: 4,
      time: '7:30 PM',
    })
    expect(tileDetails(table({ status: 'reserved' }), undefined, booking).state).toBe('Held')
  })

  it('labels a reserved table that has no booking attached', () => {
    expect(tileDetails(table({ status: 'reserved' }), undefined, undefined).state).toBe('Reserved')
  })
})

describe('seatLayout', () => {
  it('fills seats in facing pairs', () => {
    expect(seatLayout(8, 3)).toEqual({
      top: [true, true, false, false],
      bottom: [true, false, false, false],
    })
  })

  it('puts a single seat on the top side', () => {
    expect(seatLayout(1, 0)).toEqual({ top: [false], bottom: [] })
  })

  it('caps the drawing at twelve seats and never overfills', () => {
    const { top, bottom } = seatLayout(20, 30)
    expect(top.length + bottom.length).toBe(12)
    expect([...top, ...bottom].every(Boolean)).toBe(true)
  })
})

describe('summarizeFloor', () => {
  it('counts tables by tone and guests by session', () => {
    const tables = [
      table({ table_id: 1 }),
      table({ table_id: 2, status: 'dining' }),
      table({ table_id: 3, status: 'reserved' }),
      table({ table_id: 4 }),
    ]
    expect(summarizeFloor(tables, { 2: { party_size: 3 } })).toEqual({ dining: 1, reserved: 1, open: 2, guests: 3 })
  })
})

describe('tableList', () => {
  it('reads naturally for one to many tables', () => {
    expect(tableList([])).toBe('')
    expect(tableList([8])).toBe('Table 8')
    expect(tableList([3, 8])).toBe('Tables 3 and 8')
    expect(tableList([3, 8, 11])).toBe('Tables 3, 8 and 11')
    expect(tableList([1, 2, 3, 4, 5])).toBe('Tables 1, 2, 3 and 2 more')
  })
})

describe('requestSummary', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  const tablesById = { 1: table({ table_id: 1, table_number: 8 }), 2: table({ table_id: 2, table_number: 3 }) }

  it('names the table and how long it has waited', () => {
    const requests = [{ table_id: 1, created_at: '2026-11-22T11:57:00Z' }]
    expect(requestSummary(requests, tablesById, now)).toBe('Table 8 · requested 3 min ago')
  })

  it('uses the oldest request across several tables', () => {
    const requests = [
      { table_id: 1, created_at: '2026-11-22T11:58:00Z' },
      { table_id: 2, created_at: '2026-11-22T11:50:00Z' },
    ]
    expect(requestSummary(requests, tablesById, now)).toBe('Tables 3 and 8 · oldest requested 10 min ago')
  })

  it('says just now for a request under a minute old', () => {
    const requests = [{ table_id: 1, created_at: '2026-11-22T11:59:40Z' }]
    expect(requestSummary(requests, tablesById, now)).toBe('Table 8 · requested just now')
  })
})

describe('glue', () => {
  it('joins a number and its unit with a non-breaking space', () => {
    expect(glue('oldest requested 8 min ago')).toBe('oldest requested 8 min ago')
    expect(glue('Today, 8:00 PM')).toBe('Today, 8:00 PM')
    expect(glue('party of 4')).toBe('party of 4')
  })
})

describe('agoText', () => {
  it('formats elapsed time', () => {
    expect(agoText(0)).toBe('just now')
    expect(agoText(12)).toBe('12 min ago')
    expect(agoText(65)).toBe('1 h 05 min ago')
  })
})

describe('minutesOver', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  const seatedMinutesAgo = (minutes) => new Date(now - minutes * 60000).toISOString()

  it('is 0 while the party is inside the time slot, including exactly at its end', () => {
    expect(minutesOver(seatedMinutesAgo(12), 90, now)).toBe(0)
    expect(minutesOver(seatedMinutesAgo(90), 90, now)).toBe(0)
  })

  it('counts the minutes past the slot', () => {
    expect(minutesOver(seatedMinutesAgo(91), 90, now)).toBe(1)
    expect(minutesOver(seatedMinutesAgo(104), 90, now)).toBe(14)
    expect(minutesOver(seatedMinutesAgo(104), 120, now)).toBe(0)
  })

  it('stays quiet when the slot length or seating time is missing', () => {
    expect(minutesOver(seatedMinutesAgo(500), undefined, now)).toBe(0)
    expect(minutesOver(seatedMinutesAgo(500), 0, now)).toBe(0)
    expect(minutesOver(undefined, 90, now)).toBe(0)
  })
})

describe('reservations', () => {
  const early = { reservation_date: '2026-11-22', reservation_time: '18:00:00', customer_name: 'Lee', guest_count: 2 }
  const late = { reservation_date: '2026-11-22', reservation_time: '20:00:00', customer_name: 'Cruz', guest_count: 5 }
  const tomorrow = { reservation_date: '2026-11-23', reservation_time: '11:00:00', customer_name: 'Ana', guest_count: 3 }

  it('finds the earliest pending reservation across days', () => {
    expect(nextReservation([tomorrow, late, early])).toBe(early)
    expect(nextReservation([])).toBeNull()
  })

  it('writes one line for the reservation', () => {
    expect(reservationLine(late, '2026-11-22')).toBe('Cruz, party of 5 · Today, 8:00 PM')
    expect(reservationLine(tomorrow, '2026-11-22')).toBe('Ana, party of 3 · Tomorrow, 11:00 AM')
  })
})
